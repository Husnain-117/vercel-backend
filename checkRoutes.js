const fs = require('fs');
const path = require('path');

// Function to find all route files
function findRouteFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findRouteFiles(filePath, fileList);
    } else if (file.endsWith('Routes.js') || file.endsWith('routes.js') || 
               file.endsWith('Router.js') || file.endsWith('router.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Function to validate route patterns
function validateRoutePatterns(filePath) {
  console.log(`\nChecking file: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    // Look for route definitions
    if (line.match(/router\s*\.(get|post|put|delete|all|use)\s*\(\s*['"`]/)) {
      console.log(`  Line ${index + 1}: ${line.trim()}`);
    }
  });
}

// Main function
function main() {
  const routesDir = path.join(__dirname, 'routes');
  
  if (!fs.existsSync(routesDir)) {
    console.error('Routes directory not found!');
    return;
  }
  
  const routeFiles = findRouteFiles(routesDir);
  
  if (routeFiles.length === 0) {
    console.log('No route files found!');
    return;
  }
  
  console.log(`Found ${routeFiles.length} route files:`);
  routeFiles.forEach(validateRoutePatterns);
}

// Run the check
main();
