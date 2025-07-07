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
const generateCert = () => {
  try {
    // Generate private key
    execSync(`openssl genrsa -out "${keyPath}" 2048`);
    
    // Generate self-signed certificate
    execSync(`openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 365 -subj "/CN=localhost"`);
    
    console.log('Self-signed certificate generated successfully!');
    console.log(`Key: ${keyPath}`);
    console.log(`Cert: ${certPath}`);
    
    // Add to Windows Trusted Root (Windows only)
    if (process.platform === 'win32') {
      try {
        execSync(`certutil -addstore -f "ROOT" "${certPath}"`);
        console.log('Certificate added to Windows Trusted Root store');
      } catch (e) {
        console.warn('Could not add certificate to Windows Trusted Root store. You may need to run as administrator.');
      }
    }
    
  } catch (error) {
    console.error('Error generating certificate:', error.message);
    console.log('\nAlternative: You can generate certificates using mkcert:');
    console.log('1. Install mkcert: https://github.com/FiloSottile/mkcert');
    console.log('2. Run: mkcert -install');
    console.log(`3. Run: mkcert -key-file "${keyPath}" -cert-file "${certPath}" localhost 127.0.0.1 ::1 192.168.1.16`);
  }
};

// Check if certificates already exist
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  console.log('Certificates already exist. Skipping generation.');
  console.log(`Key: ${keyPath}`);
  console.log(`Cert: ${certPath}`);
} else {
  generateCert();
}
