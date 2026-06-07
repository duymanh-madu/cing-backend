const fs = require('fs');
const file = '/Users/style/cing-miniapp-frontend/src/features/game-center/games/chess/ChessGame.jsx';
let content = fs.readFileSync(file, 'utf8');

// ── Fix âm thanh ──
const oldSounds = `    if (type === "move") {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.08);
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(); osc.stop(ctx.currentTime + 0.08);

    } else if (type === "warning") {
      // 3 beep ngắn cảnh báo còn 10s
      [0, 0.2, 0.4].forEach(d => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "square";
        o.frequency.setValueAtTime(660, ctx.currentTime + d);
        g.gain.setValueAtTime(0.15, ctx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.12);
        o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.12);
      });

    } else if (type === "gift_receive") {
      // Nhận quà: 3 nốt đi lên vui vẻ
      const notes = [523, 659, 784];
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "sine";
        o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.2);
        o.start(ctx.currentTime + i * 0.12);
        o.stop(ctx.currentTime + i * 0.12 + 0.2);
      });

    } else if (type === "gift_send") {
      // Gửi quà: 1 nốt nhẹ xác nhận
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.setValueAtTime(784, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1046, ctx.currentTime + 0.15);
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      o.start(); o.stop(ctx.currentTime + 0.3);

    } else if (type === "emoji") {
      // Emoji: pop nhẹ
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.setValueAtTime(440, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.05);
      o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      o.start(); o.stop(ctx.currentTime + 0.15);
    }`;

const newSounds = `    if (type === "move") {
      // Tiếng gõ quân cờ — rõ ràng, chắc chắn
      const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
      o1.connect(g1); g1.connect(ctx.destination);
      o1.type = "triangle";
      o1.frequency.setValueAtTime(800, ctx.currentTime);
      o1.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
      g1.gain.setValueAtTime(0.5, ctx.currentTime);
      g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      o1.start(); o1.stop(ctx.currentTime + 0.15);
      // Tiếng vang nhẹ
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
      o2.connect(g2); g2.connect(ctx.destination);
      o2.type = "sine";
      o2.frequency.setValueAtTime(400, ctx.currentTime + 0.05);
      g2.gain.setValueAtTime(0.15, ctx.currentTime + 0.05);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      o2.start(ctx.currentTime + 0.05); o2.stop(ctx.currentTime + 0.3);

    } else if (type === "warning") {
      // Cảnh báo 10s — 3 tiếng beep dồn dập, to hơn
      [0, 0.25, 0.5].forEach((d, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "square";
        o.frequency.setValueAtTime(880 + i*110, ctx.currentTime + d);
        g.gain.setValueAtTime(0.35, ctx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.18);
        o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.18);
      });

    } else if (type === "gift_receive") {
      // Nhận quà — nhạc chuông trang trọng 5 nốt
      const melody = [523, 659, 784, 1046, 784];
      melody.forEach((freq, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "sine";
        o.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.13);
        g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.13);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.13 + 0.25);
        o.start(ctx.currentTime + i * 0.13);
        o.stop(ctx.currentTime + i * 0.13 + 0.25);
      });

    } else if (type === "gift_send") {
      // Gửi quà — 2 nốt xác nhận ngọt ngào
      [[659, 0], [784, 0.15]].forEach(([freq, d]) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "sine";
        o.frequency.setValueAtTime(freq, ctx.currentTime + d);
        g.gain.setValueAtTime(0.25, ctx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.25);
        o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.25);
      });

    } else if (type === "emoji") {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.setValueAtTime(523, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(784, ctx.currentTime + 0.08);
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      o.start(); o.stop(ctx.currentTime + 0.2);
    }`;

if (!content.includes(oldSounds)) { console.log('ERROR: sounds not found'); process.exit(1); }
content = content.replace(oldSounds, newSounds);

// ── Fix popup nhận quà ──
const oldPopup = `        {tipResult && (
          <div style={{ position:"fixed", inset:0, zIndex:9990, background:"rgba(0,0,0,0.7)",
            display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none",
            animation:"fadeOverlay 3s ease-out forwards" }}>
            <div style={{ position:"relative", display:"flex", flexDirection:"column", alignItems:"center", gap:16,
              animation:"popEmoji 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards" }}>
              {/* Rays */}
              {[...Array(12)].map((_,i) => (
                <div key={i} style={{
                  position:"absolute", width:2, height:tipResult.fromMe?60:80,
                  background:\`linear-gradient(to top, transparent, \${tipResult.fromMe?"#FFD700":"#00ff88"})\`,
                  transformOrigin:"bottom center",
                  transform:\`rotate(\${i*30}deg) translateY(-\${tipResult.fromMe?90:110}px)\`,
                  opacity:0.5, borderRadius:1,
                }}/>
              ))}
              {/* Main badge */}
              <div style={{
                background: tipResult.fromMe
                  ? "linear-gradient(135deg,#8B6914,#FFD700,#FFF3a0,#FFD700,#8B6914)"
                  : "linear-gradient(135deg,#006b3c,#00c864,#80ffb8,#00c864,#006b3c)",
                borderRadius:20, padding:"20px 32px", textAlign:"center",
                boxShadow: tipResult.fromMe
                  ? "0 0 40px rgba(255,215,0,0.8), 0 0 80px rgba(255,215,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)"
                  : "0 0 40px rgba(0,200,100,0.8), 0 0 80px rgba(0,200,100,0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
                border: \`2px solid \${tipResult.fromMe?"rgba(255,255,200,0.6)":"rgba(150,255,200,0.6)"}\`,
                minWidth:220,
              }}>
                <p style={{ fontSize:40, margin:"0 0 8px" }}>💎</p>
                <p style={{ color: tipResult.fromMe?"#1a0a00":"#003820", fontSize:20, fontWeight:900, margin:"0 0 4px",
                  textShadow:"0 1px 0 rgba(255,255,255,0.3)" }}>
                  {tipResult.fromMe ? \`Bạn đã tặng \${tipResult.giftIcon||""} \${tipResult.giftName||tipResult.amount+" điểm"}\` : \`\${tipResult.giftIcon||""} \${tipResult.giftName||tipResult.amount+" điểm"}\`}
                </p>
                <p style={{ color: tipResult.fromMe?"rgba(26,10,0,0.7)":"rgba(0,56,32,0.8)", fontSize:12, fontWeight:700, margin:0 }}>
                  {tipResult.fromMe ? "Đã gửi đến đối thủ" : "Đối thủ vừa tặng bạn"}
                </p>
              </div>
            </div>
          </div>
        )}`;

const newPopup = `        {tipResult && (
          <div style={{ position:"fixed", inset:0, zIndex:9990,
            background:"rgba(0,0,0,0.75)", backdropFilter:"blur(4px)",
            display:"flex", alignItems:"center", justifyContent:"center",
            pointerEvents:"none", animation:"fadeOverlay 3.5s ease-out forwards" }}>
            <div style={{ position:"relative", display:"flex", flexDirection:"column",
              alignItems:"center", animation:"popEmoji 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards" }}>

              {/* Tia sáng */}
              {[...Array(16)].map((_,i) => (
                <div key={i} style={{
                  position:"absolute", width:2,
                  height: tipResult.fromMe ? 50 : 90,
                  background: tipResult.fromMe
                    ? \`linear-gradient(to top, transparent, rgba(255,215,0,\${0.3+i%3*0.2}))\`
                    : \`linear-gradient(to top, transparent, rgba(100,220,255,\${0.3+i%3*0.2}))\`,
                  transformOrigin:"bottom center",
                  transform:\`rotate(\${i*22.5}deg) translateY(-\${tipResult.fromMe?110:140}px)\`,
                  borderRadius:2,
                }}/>
              ))}

              {/* Badge chính */}
              <div style={{
                background: tipResult.fromMe
                  ? "linear-gradient(145deg,#6B4C11,#C8960C,#FFD700,#FFF0A0,#FFD700,#C8960C,#6B4C11)"
                  : "linear-gradient(145deg,#0a2a4a,#0d5a8a,#1490d0,#7dd4f8,#1490d0,#0d5a8a,#0a2a4a)",
                borderRadius:24, padding:"24px 36px", textAlign:"center",
                boxShadow: tipResult.fromMe
                  ? "0 0 60px rgba(255,215,0,0.9), 0 0 120px rgba(255,215,0,0.4), 0 8px 32px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.4)"
                  : "0 0 60px rgba(30,180,255,0.9), 0 0 120px rgba(30,180,255,0.4), 0 8px 32px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.3)",
                border: \`2px solid \${tipResult.fromMe?"rgba(255,240,150,0.8)":"rgba(150,220,255,0.8)"}\`,
                minWidth:240, maxWidth:300,
              }}>
                {/* Icon quà */}
                <div style={{ fontSize:56, marginBottom:8, lineHeight:1,
                  filter:"drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}>
                  {tipResult.giftIcon || "🎁"}
                </div>

                {/* Tên quà */}
                <p style={{
                  color: tipResult.fromMe ? "#1a0800" : "#e8f8ff",
                  fontSize:18, fontWeight:900, margin:"0 0 6px",
                  textShadow: tipResult.fromMe
                    ? "0 1px 0 rgba(255,255,255,0.5)"
                    : "0 1px 4px rgba(0,0,0,0.8)",
                }}>
                  {tipResult.giftName || "Vật phẩm"}
                </p>

                {/* Thông tin */}
                <p style={{
                  color: tipResult.fromMe ? "rgba(26,8,0,0.75)" : "rgba(200,240,255,0.9)",
                  fontSize:13, fontWeight:700, margin:"0 0 4px",
                }}>
                  {tipResult.fromMe
                    ? "✨ Đã gửi đến đối thủ"
                    : \`🎁 \${tipResult.giftName ? opponent?.name || "Đối thủ" : "Đối thủ"} vừa tặng bạn!\`}
                </p>

                {/* Điểm quyến rũ */}
                {tipResult.charm > 0 && !tipResult.fromMe && (
                  <div style={{
                    background:"rgba(0,0,0,0.2)", borderRadius:10,
                    padding:"6px 14px", display:"inline-block", marginTop:4,
                  }}>
                    <span style={{ color:"#FFD700", fontSize:14, fontWeight:900 }}>
                      +{tipResult.charm} ✨ điểm quyến rũ
                    </span>
                  </div>
                )}
                {tipResult.fromMe && (
                  <div style={{
                    background:"rgba(0,0,0,0.15)", borderRadius:10,
                    padding:"6px 14px", display:"inline-block", marginTop:4,
                  }}>
                    <span style={{ color:"rgba(26,8,0,0.6)", fontSize:13, fontWeight:700 }}>
                      -{tipResult.amount} điểm tích lũy
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}`;

if (!content.includes(oldPopup)) { console.log('ERROR: popup not found'); process.exit(1); }
content = content.replace(oldPopup, newPopup);

fs.writeFileSync(file, content, 'utf8');
console.log('✅ Gift popup & sounds upgraded');
