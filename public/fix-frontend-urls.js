// fix-frontend-urls.js
// Run this once to update ALL frontend files with production URL
// Place this in your project ROOT folder (same level as backend/ and public/)

const fs = require('fs');
const path = require('path');

const PRODUCTION_URL = 'https://ai-smart-hub.onrender.com';
const PROJECT_ROOT = __dirname;

// Files/folders to exclude
const EXCLUDE = [
    'node_modules',
    '.git',
    'backend',
    'database.sqlite',
    'package-lock.json',
    'package.json',
    '.env',
    '.env.example',
    '.gitignore',
    'start.bat',
    'wrangler.toml',
    'adminroutes.js',
    'planlimit.js',
    'plans.js',
    'requireActivePlan.js',
    'lokk',
    'fix-frontend-urls.js' // Don't modify this script
];

// File extensions to process
const VALID_EXTENSIONS = ['.html', '.js'];

let updatedCount = 0;
let scannedCount = 0;

console.log('🔧 Starting FRONTEND URL fix...');
console.log(`📡 Production URL: ${PRODUCTION_URL}`);
console.log('========================================');

function shouldExclude(filePath) {
    const relativePath = path.relative(PROJECT_ROOT, filePath);
    return EXCLUDE.some(exclude => 
        relativePath.includes(exclude) || 
        filePath.includes(exclude) ||
        relativePath === exclude
    );
}

function processFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;
        let fileUpdated = false;

        // Skip if file is empty
        if (!content.trim()) return false;

        // Only process files that likely contain URLs
        if (content.includes('localhost') || content.includes('const BACKEND_URL') || content.includes('fetch(')) {
            
            // Replace ALL localhost patterns
            const patterns = [
                /http:\/\/window.BACKEND_URL/g,
                /https:\/\/window.BACKEND_URL/g,
                /window.BACKEND_URL/g,
                /http:\/\/localhost:\d+/g,
                /https:\/\/localhost:\d+/g,
                /localhost:\d+/g
            ];

            patterns.forEach(pattern => {
                content = content.replace(pattern, PRODUCTION_URL);
            });

            // Replace or add BACKEND_URL constant
            if (content.includes('const BACKEND_URL')) {
                // Update existing BACKEND_URL
                content = content.replace(/const BACKEND_URL\s*=\s*['"](.*?)['"]/g, `const BACKEND_URL = window.BACKEND_URL;`);
            }

            // Replace API_URL if it exists
            if (content.includes('const API_URL')) {
                content = content.replace(/const API_URL\s*=\s*['"](.*?)['"]/g, `const API_URL = window.BACKEND_URL;`);
            }

            // Replace SERVER_URL if it exists (for widget)
            if (content.includes('const SERVER_URL')) {
                content = content.replace(/const SERVER_URL\s*=\s*['"](.*?)['"]/g, `const SERVER_URL = '${PRODUCTION_URL}'`);
            }

            // Fix any fetch calls that might have relative paths
            // This ensures they use the full URL
            if (filePath.endsWith('.js') && !filePath.includes('widget.js')) {
                // Don't modify if it already has BACKEND_URL
                if (!content.includes('BACKEND_URL') && !content.includes('`${')) {
                    // Add BACKEND_URL at the top of the file
                    const lines = content.split('\n');
                    let insertPos = 0;
                    
                    // Find a good place to insert (after any shebang or comments)
                    for (let i = 0; i < Math.min(10, lines.length); i++) {
                        if (!lines[i].startsWith('//') && !lines[i].startsWith('#!')) {
                            insertPos = i;
                            break;
                        }
                    }
                    
                    lines.splice(insertPos, 0, `// Production backend URL\nconst BACKEND_URL = window.BACKEND_URL;;\n`);
                    content = lines.join('\n');
                }
            }

            // Special handling for HTML files
            if (filePath.endsWith('.html')) {
                // Add BACKEND_URL to scripts that don't have it
                if (content.includes('<script>') && !content.includes('const BACKEND_URL')) {
                    content = content.replace('<script>', `<script>\n    // Production backend URL\n    const BACKEND_URL = window.BACKEND_URL;;\n    console.log('[PAGE] Using backend:', BACKEND_URL);`);
                }
                
                // Fix any inline script tags
                content = content.replace(/<script[^>]*>([\s\S]*?)<\/script>/g, (match, scriptContent) => {
                    if (scriptContent.includes('localhost') && !scriptContent.includes('const BACKEND_URL')) {
                        const updatedScript = `\n    // Production backend URL\n    const BACKEND_URL = window.BACKEND_URL;;\n` + scriptContent;
                        return match.replace(scriptContent, updatedScript);
                    }
                    return match;
                });
            }

            // Only write if content changed
            if (content !== originalContent) {
                fs.writeFileSync(filePath, content, 'utf8');
                return true;
            }
        }
        return false;
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
        
        if (shouldExclude(filePath)) {
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

// Start scanning from public folder
console.log('📂 Scanning public folder and subdirectories...');
const publicDir = path.join(PROJECT_ROOT, 'public');

if (!fs.existsSync(publicDir)) {
    console.error('❌ public folder not found!');
    process.exit(1);
}

const allFiles = walkDir(publicDir);

console.log(`📊 Found ${allFiles.length} frontend files to process.`);
console.log('========================================');

// Process each file
allFiles.forEach(file => {
    scannedCount++;
    const relativePath = path.relative(PROJECT_ROOT, file);
    process.stdout.write(`⏳ Processing ${relativePath}... `);
    
    const wasUpdated = processFile(file);
    
    if (wasUpdated) {
        updatedCount++;
        console.log('✅ UPDATED');
    } else {
        console.log('⏭️  No changes');
    }
});

console.log('========================================');
console.log(`✅ Complete! Scanned ${scannedCount} files.`);
console.log(`📝 Updated: ${updatedCount} files`);
console.log(`⏭️  Unchanged: ${scannedCount - updatedCount} files`);
console.log('\n📊 Files updated include:');
console.log('   - All HTML files in public/');
console.log('   - All JS files in public/js/');
console.log('   - Any JS files directly in public/');
console.log('   - Any nested JS files in subfolders');
console.log('\n📝 Next steps:');
console.log('1. Run: git add public/ -f');
console.log('2. Run: git commit -m "Update all frontend files with production URL"');
console.log('3. Run: git push');
console.log('\n🚀 Your entire frontend is now production-ready!');