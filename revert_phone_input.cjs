const fs = require('fs');
const file = '/Users/style/cing-miniapp-frontend/src/features/home/components/HomeMembershipCard.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  `  // Cho phép nhập SĐT thủ công khi chưa có phone — cả web lẫn Zalo Mini App
  if (!phone && !submittedPhone) {`,
  `  if (!phone && isWeb && !submittedPhone) {`
);

fs.writeFileSync(file, content, 'utf8');
console.log('✅ Reverted phone input to isWeb only');
