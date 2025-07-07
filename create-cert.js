const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, 'certs');
const keyPath = path.join(certDir, 'private.key');
const certPath = path.join(certDir, 'certificate.crt');

// Create certs directory if it doesn't exist
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

// Generate private key and self-signed certificate
try {
  // Generate private key
  execSync(`openssl genrsa -out "${keyPath}" 2048`);
  
  // Generate self-signed certificate
  execSync(`openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 365 -subj "/CN=localhost"`);
  
  console.log('Self-signed certificate generated successfully!');
  console.log(`Key: ${keyPath}`);
  console.log(`Cert: ${certPath}`);
  
} catch (error) {
  console.error('Error generating certificate:', error.message);
  console.log('\nPlease install OpenSSL and try again.');
  console.log('On Windows, you can install it via Chocolatey:');
  console.log('1. Install Chocolatey: https://chocolatey.org/install');
  console.log('2. Run: choco install openssl');
}
