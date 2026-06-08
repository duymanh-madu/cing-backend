const fs = require('fs');
const file = '/Users/style/cing-miniapp-frontend/src/features/game-center/components/CommunityChat.jsx';
let content = fs.readFileSync(file, 'utf8');

// Kiểm tra đã có chưa
if (content.includes('const [showRules, setShowRules]')) {
  console.log('Already exists!');
  process.exit(0);
}

// Tìm tab state và thêm sau
const target = 'const [tab, setTab] = useState("chat");';
if (!content.includes(target)) {
  console.log('ERROR: target not found');
  console.log('First useState:', content.match(/const \[.+useState/)?.[0]);
  process.exit(1);
}

content = content.replace(target, target + '\n  const [showRules, setShowRules] = useState(false);');
fs.writeFileSync(file, content, 'utf8');
console.log('✅ showRules state added');
