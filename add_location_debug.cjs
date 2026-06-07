const fs = require('fs');
const file = '/Users/style/cing-miniapp-frontend/src/features/checkout/pages/CheckoutPage.jsx';
let content = fs.readFileSync(file, 'utf8');

const oldLine = `        const result = await zmpSdk.getLocation();
        
        // Thử latitude/longitude trực tiếp (deprecated nhưng vẫn hoạt động một số version)`;

const newLine = `        const result = await zmpSdk.getLocation();
        console.log("[LOCATION] zmp-sdk result:", JSON.stringify(result));
        
        // Thử latitude/longitude trực tiếp (deprecated nhưng vẫn hoạt động một số version)`;

if (!content.includes(oldLine)) {
  console.log('ERROR: Pattern not found');
  process.exit(1);
}
content = content.replace(oldLine, newLine);
fs.writeFileSync(file, content, 'utf8');
console.log('✅ Debug log added');
