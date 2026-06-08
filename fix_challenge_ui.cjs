const fs = require('fs');
const file = '/Users/style/cing-miniapp-frontend/src/features/game-center/pages/GameCenterPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// Đổi state từ single sang array
content = content.replace(
  `  const [challenge, setChallenge]         = useState(null);`,
  `  const [challenges, setChallenges]       = useState([]);
  const [challenge, setChallenge]         = useState(null); // backward compat`
);

// Đổi fetch để nhận array
content = content.replace(
  `  useEffect(() => {
    apiClient.get("/game/daily-challenge")
      .then(r => setChallenge(r.data?.data))
      .catch(() => {});
  }, []);`,
  `  useEffect(() => {
    apiClient.get("/game/daily-challenge")
      .then(r => {
        const data = r.data?.data;
        if (Array.isArray(data)) {
          setChallenges(data);
          setChallenge(data[0] || null);
        } else {
          setChallenges(data ? [data] : []);
          setChallenge(data || null);
        }
      })
      .catch(() => {});
  }, []);`
);

// Thay UI challenge section — từ single sang map array
const oldUI = `      <div style={{ margin:"0 16px 20px", background: challenge?.completed ? "linear-gradient(135deg,rgba(76,175,80,0.15),rgba(76,175,80,0.05))" : "linear-gradient(135deg,rgba(255,215,0,0.12),rgba(255,140,0,0.08))", border: challenge?.completed ? "1px solid rgba(76,175,80,0.3)" : "1px solid rgba(255,215,0,0.2)", borderRadius:20, padding:"16px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: challenge?.completed ? 10 : 0 }}>
          <div>
            <p style={{ color: challenge?.completed ? "#4CAF50" : "#FFD700", fontSize:11, fontWeight:800, margin:"0 0 4px", letterSpacing:2 }}>{challenge?.completed ? "✅ ĐÃ CÓ NGƯỜI NHẬN THƯỞNG" : "🎯 THÁCH THỨC HÔM NAY"}</p>
            <p style={{ color:"white", fontSize:15, fontWeight:800, margin:"0 0 3px" }}>{challenge?.label || \`Đạt combo \${challenge?.target_value || 100} trong game "Bay cùng trân châu"\`}</p>
            <p style={{ color:"rgba(255,255,255,0.4)", fontSize:11, margin:0 }}>Phần thưởng: +{challenge?.reward_points || 50} điểm tích luỹ • Chỉ 1 người đầu tiên</p>
          </div>
          <div style={{ fontSize:36 }}>{challenge?.completed ? "🏆" : "🎯"}</div>
        </div>
        {challenge?.completed && challenge?.winner_name && (
          <div style={{ background:"rgba(76,175,80,0.1)", borderRadius:12, padding:"10px 12px" }}>
            <p style={{ color:"#4CAF50", fontSize:12, fontWeight:700, margin:0 }}>Chúc mừng <strong>{challenge.winner_name}</strong> đã xuất sắc nhận được phần thưởng thử thách ngày!</p>
          </div>
        )}
      </div>`;

const newUI = `      <div style={{ margin:"0 16px 20px" }}>
        <p style={{ color:"#FFD700", fontSize:11, fontWeight:800, margin:"0 0 10px", letterSpacing:2 }}>🎯 THÁCH THỨC HÔM NAY</p>
        {challenges.map((c, idx) => (
          <div key={idx} style={{
            background: c.completed ? "linear-gradient(135deg,rgba(76,175,80,0.15),rgba(76,175,80,0.05))" : "linear-gradient(135deg,rgba(255,215,0,0.12),rgba(255,140,0,0.08))",
            border: c.completed ? "1px solid rgba(76,175,80,0.3)" : "1px solid rgba(255,215,0,0.2)",
            borderRadius:16, padding:"14px 16px", marginBottom:10,
          }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: c.completed ? 8 : 0 }}>
              <div style={{ flex:1 }}>
                {c.completed && <p style={{ color:"#4CAF50", fontSize:10, fontWeight:800, margin:"0 0 3px", letterSpacing:2 }}>✅ ĐÃ CÓ NGƯỜI NHẬN THƯỞNG</p>}
                <p style={{ color:"white", fontSize:14, fontWeight:800, margin:"0 0 3px" }}>
                  {c.label || \`Đạt combo \${c.target_value || 100}\`}
                </p>
                <p style={{ color:"rgba(255,255,255,0.4)", fontSize:11, margin:0 }}>
                  Thưởng: +{c.reward_points || 50} điểm • Chỉ 1 người đầu tiên
                </p>
              </div>
              <div style={{ fontSize:30, marginLeft:10 }}>{c.completed ? "🏆" : "🎯"}</div>
            </div>
            {c.completed && c.winner_name && (
              <div style={{ background:"rgba(76,175,80,0.1)", borderRadius:10, padding:"8px 12px" }}>
                <p style={{ color:"#4CAF50", fontSize:12, fontWeight:700, margin:0 }}>
                  Chúc mừng <strong>{c.winner_name}</strong> đã nhận thưởng!
                </p>
              </div>
            )}
          </div>
        ))}
      </div>`;

if (!content.includes(oldUI)) { console.log('ERROR: UI pattern not found'); process.exit(1); }
content = content.replace(oldUI, newUI);
fs.writeFileSync(file, content, 'utf8');
console.log('✅ Challenge UI shows multiple challenges');
