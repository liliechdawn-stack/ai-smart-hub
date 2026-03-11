// backend/migrate-to-supabase.js
const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname);
const API_DIR = path.join(__dirname, '..', 'api');

// Files that need updating (excluding node_modules, backups, etc.)
const excludeFiles = [
  'database.js', 'database-old.js', 'database-supabase.js', 
  'migrate-to-supabase.js', 'node_modules', '.git', 'backup'
];

// Function to backup a file
function backupFile(filePath) {
  const backupPath = filePath + '.backup';
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
    console.log(`✅ Backed up: ${path.basename(filePath)}`);
  }
}

// Function to convert SQLite to Supabase
function convertToSupabase(content) {
  let newContent = content;

  // 1. Remove sqlite3 require
  newContent = newContent.replace(/const sqlite3 = require\(["']sqlite3["']\)\.verbose\(\);\n?/g, '');
  newContent = newContent.replace(/const sqlite3 = require\(['"]sqlite3['"]\);\n?/g, '');

  // 2. Add Supabase import if not present
  if (!newContent.includes('require(\'./database-supabase\')') && 
      !newContent.includes('require("./database-supabase")')) {
    // Find where to insert
    const lines = newContent.split('\n');
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('require(') && !lines[i].includes('database-supabase')) {
        insertAt = i + 1;
      }
    }
    lines.splice(insertAt, 0, 'const { supabase } = require(\'./database-supabase\');');
    newContent = lines.join('\n');
  }

  // 3. Replace db.get() with Supabase
  newContent = newContent.replace(/db\.get\(`([^`]*)`,\s*\[([^\]]*)\],\s*\((err|error),\s*(row|result)\)\s*=>\s*{([^}]*)}/g, 
    (match, query, params, errVar, rowVar, callback) => {
      const tableMatch = query.match(/FROM\s+(\w+)/i);
      const table = tableMatch ? tableMatch[1] : 'unknown';
      const whereMatch = query.match(/WHERE\s+(\w+)\s*=\s*\?/i);
      const whereField = whereMatch ? whereMatch[1] : 'id';
      
      return `try {
    const { data: ${rowVar}, error: ${errVar} } = await supabase
      .from('${table}')
      .select('*')
      .eq('${whereField}', ${params.replace(/\?/g, 'param')})
      .single();
    
    if (${errVar}) {
      console.error('Database error:', ${errVar});
      return res.status(500).json({ error: 'Database error' });
    }
    ${callback.replace(/return/g, '').trim()}
  } catch (${errVar}) {
    console.error('Error:', ${errVar});
    res.status(500).json({ error: 'Server error' });
  }`;
    });

  // 4. Replace db.all() with Supabase
  newContent = newContent.replace(/db\.all\(`([^`]*)`,\s*\[([^\]]*)\],\s*\((err|error),\s*(rows|result)\)\s*=>\s*{([^}]*)}/g,
    (match, query, params, errVar, rowsVar, callback) => {
      const tableMatch = query.match(/FROM\s+(\w+)/i);
      const table = tableMatch ? tableMatch[1] : 'unknown';
      const orderMatch = query.match(/ORDER BY\s+(\w+)\s+(DESC|ASC)/i);
      const orderBy = orderMatch ? orderMatch[1] : 'created_at';
      const orderDir = orderMatch ? orderMatch[2] : 'desc';
      
      return `try {
    const { data: ${rowsVar}, error: ${errVar} } = await supabase
      .from('${table}')
      .select('*')
      .order('${orderBy}', { ascending: ${orderDir === 'ASC'}});
    
    if (${errVar}) {
      console.error('Database error:', ${errVar});
      return res.status(500).json({ error: 'Database error' });
    }
    ${callback.replace(/return/g, '').trim()}
  } catch (${errVar}) {
    console.error('Error:', ${errVar});
    res.status(500).json({ error: 'Server error' });
  }`;
    });

  // 5. Replace db.run() with Supabase
  newContent = newContent.replace(/db\.run\(`([^`]*)`,\s*\[([^\]]*)\],\s*function\s*\((err|error)\)\s*{([^}]*)}/g,
    (match, query, params, errVar, callback) => {
      if (query.includes('INSERT INTO')) {
        const tableMatch = query.match(/INSERT INTO\s+(\w+)/i);
        const table = tableMatch ? tableMatch[1] : 'unknown';
        
        // Parse columns from INSERT
        const columnsMatch = query.match(/\(([^)]+)\)/);
        const columns = columnsMatch ? columnsMatch[1].split(',').map(c => c.trim()) : [];
        
        return `try {
    const { error: ${errVar} } = await supabase
      .from('${table}')
      .insert({ /* map your columns here */ });
    
    if (${errVar}) {
      console.error('Database error:', ${errVar});
      ${callback.includes('res.status') ? callback : 'return res.status(500).json({ error: "Database error" });'}
    }
    ${callback.replace(/if.*/, '').trim()}
  } catch (${errVar}) {
    console.error('Error:', ${errVar});
    res.status(500).json({ error: 'Server error' });
  }`;
      }
      
      if (query.includes('UPDATE')) {
        const tableMatch = query.match(/UPDATE\s+(\w+)/i);
        const table = tableMatch ? tableMatch[1] : 'unknown';
        
        return `try {
    const { error: ${errVar} } = await supabase
      .from('${table}')
      .update({ /* update data */ })
      .eq('id', id);
    
    if (${errVar}) {
      console.error('Database error:', ${errVar});
      ${callback.includes('res.status') ? callback : 'return res.status(500).json({ error: "Database error" });'}
    }
    ${callback.replace(/if.*/, '').trim()}
  } catch (${errVar}) {
    console.error('Error:', ${errVar});
    res.status(500).json({ error: 'Server error' });
  }`;
      }
      
      return match;
    });

  // 6. Replace db.serialize() blocks
  newContent = newContent.replace(/db\.serialize\(\(\)\s*=>\s*{([^}]*)}\);/g, '// Removed SQLite serialization\n');

  // 7. Replace datetime('now') with new Date().toISOString()
  newContent = newContent.replace(/datetime\(['"]now['"]\)/g, 'new Date().toISOString()');
  newContent = newContent.replace(/datetime\(['"]now['"],\s*['"]\+(\d+)\s+days['"]\)/g, 
    (match, days) => `new Date(Date.now() + ${days} * 24 * 60 * 60 * 1000).toISOString()`);

  // 8. Remove SQLite-specific error handling
  newContent = newContent.replace(/if\s*\(\s*err\s*&&\s*!err\.message\.includes\(['"]duplicate column['"]\)\)/g, 'if (err)');

  return newContent;
}

// Function to process a directory
function processDirectory(dir) {
  console.log(`\n📁 Processing directory: ${dir}`);
  
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and hidden directories
      if (!file.startsWith('.') && file !== 'node_modules' && file !== 'backup') {
        processDirectory(filePath);
      }
      return;
    }
    
    // Only process .js files
    if (!file.endsWith('.js')) return;
    
    // Skip excluded files
    if (excludeFiles.includes(file)) return;
    
    console.log(`  🔄 Checking: ${file}`);
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if file uses SQLite
    if (content.includes('sqlite3') || content.includes('db.run') || 
        content.includes('db.get') || content.includes('db.all')) {
      
      console.log(`  ⚠️ Found SQLite in: ${file}`);
      backupFile(filePath);
      
      const newContent = convertToSupabase(content);
      fs.writeFileSync(filePath, newContent);
      console.log(`  ✅ Updated: ${file}`);
    }
  });
}

// Main function
async function main() {
  console.log('🚀 Starting Supabase migration...\n');
  
  // Process backend directory
  if (fs.existsSync(BACKEND_DIR)) {
    processDirectory(BACKEND_DIR);
  }
  
  // Process api directory
  if (fs.existsSync(API_DIR)) {
    processDirectory(API_DIR);
  }
  
  console.log('\n✅ Migration complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Test your application locally');
  console.log('2. Fix any remaining SQLite references manually');
  console.log('3. Commit and push to GitHub');
  console.log('4. Redeploy on Render');
}

main().catch(console.error);