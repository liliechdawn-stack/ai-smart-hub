// backend/fix-backend-urls.js
// Run this script once to update ALL backend files with production URL

const fs = require('fs');
const path = require('path');

const PRODUCTION_URL = 'https://ai-smart-hub.onrender.com';
const BACKEND_DIR = __dirname;

// Files to exclude from processing
const EXCLUDE_FILES = [
    'fix-backend-urls.js',  // Don't modify this script itself
    'node_modules',          // Skip node_modules
    'database.sqlite',       // Skip database file
    '.git',                  // Skip git folder
    'server-old.js',         // Skip old backups
    'auth-old.js'            // Skip old backups
];

// File extensions to process
const VALID_EXTENSIONS = ['.js', '.json', '.html'];

console.log('🔧 Starting backend URL fix...');
console.log(`📡 Production URL: ${PRODUCTION_URL}`);
console.log('----------------------------------------');

function processFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;
        
        // Replace common localhost patterns
        content = content.replace(/http:\/\/localhost:5000/g, PRODUCTION_URL);
        content = content.replace(/localhost:5000/g, PRODUCTION_URL);
        content = content.replace(/const BACKEND_URL = ['"](.*)['"]/g, `const BACKEND_URL = '${PRODUCTION_URL}'`);
        content = content.replace(/const API_URL = ['"](.*)['"]/g, `const API_URL = '${PRODUCTION_URL}'`);
        content = content.replace(/const SERVER_URL = ['"](.*)['"]/g, `const SERVER_URL = '${PRODUCTION_URL}'`);
        content = content.replace(/const BASE_URL = ['"](.*)['"]/g, `const BASE_URL = '${PRODUCTION_URL}'`);
        
        // Replace any URL pattern that matches localhost
        content = content.replace(/['"]http:\/\/localhost:\d+['"]/g, `'${PRODUCTION_URL}'`);
        
        // Fix widget.js specific pattern
        if (filePath.includes('widget.js')) {
            content = content.replace(/const SERVER_URL = .*?;/g, `const SERVER_URL = '${PRODUCTION_URL}';`);
        }
        
        // Only write if content changed
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ Updated: ${path.relative(BACKEND_DIR, filePath)}`);
            return true;
        } else {
            console.log(`⏭️  No changes: ${path.relative(BACKEND_DIR, filePath)}`);
            return false;
        }
    } catch (err) {
        console.log(`❌ Error processing ${filePath}:`, err.message);
        return false;
    }
}

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        // Check if file should be excluded
        const shouldExclude = EXCLUDE_FILES.some(exclude => 
            filePath.includes(exclude) || file === exclude
        );
        
        if (shouldExclude) {
            console.log(`⏭️  Skipping excluded: ${file}`);
            return;
        }
        
        if (stat && stat.isDirectory()) {
            // Recursively walk subdirectories
            results = results.concat(walkDir(filePath));
        } else {
            const ext = path.extname(file);
            if (VALID_EXTENSIONS.includes(ext)) {
                results.push(filePath);
            }
        }
    });
    
    return results;
}

// Get all files in backend directory
console.log('📂 Scanning backend directory...');
const allFiles = walkDir(BACKEND_DIR);

console.log(`📊 Found ${allFiles.length} files to process.`);
console.log('----------------------------------------');

let updatedCount = 0;
let skippedCount = 0;

// Process each file
allFiles.forEach(file => {
    const wasUpdated = processFile(file);
    if (wasUpdated) updatedCount++;
    else skippedCount++;
});

console.log('----------------------------------------');
console.log(`✅ Complete! ${updatedCount} files updated.`);
console.log(`⏭️  ${skippedCount} files unchanged.`);
console.log('\n📝 Next steps:');
console.log('1. Run: git add backend/ -f');
console.log('2. Run: git commit -m "Update all backend files with production URL"');
console.log('3. Run: git push');
console.log('\n🚀 Your backend is now production-ready!');