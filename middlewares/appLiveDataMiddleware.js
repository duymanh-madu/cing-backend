'use strict';
// Public invalidation hints contain domain names only, never customer/order data.
function domainsForMutation(url='') {
  const value=String(url).toLowerCase();
  if (/\/auth\/|\/tracking|\/analytics\/track|heartbeat/.test(value)) return [];
  if (/game|chess|leaderboard|mission|reward/.test(value)) return ['leaderboard','game','missions','rewards','profile','membership','wallet'];
  if (/order|checkout|payment|ipos|delivery|wallet|topup/.test(value)) return ['orders','leaderboard','membership','wallet','missions','admin'];
  if (/menu|product|categor|inventory|stock/.test(value)) return ['menu','admin'];
  if (/profile|player|customer|membership|loyalty|gift|charm/.test(value)) return ['profile','membership','leaderboard','rewards','wallet'];
  if (/voucher|coupon|campaign/.test(value)) return ['voucher','campaign','membership','rewards'];
  if (/plaza/.test(value)) return ['plaza','profile','wallet'];
  if (/notification/.test(value)) return ['notifications','rewards'];
  if (/admin|config|cms|banner|popup/.test(value)) return ['config','menu','campaign','admin'];
  return [];
}
const pending=new Set();let timer=null;
function schedule(domains) {
  domains.forEach(domain=>pending.add(domain));
  if(timer || !pending.size)return;
  timer=setTimeout(()=>{
    timer=null;const domains=[...pending];pending.clear();
    try { global.io?.emit('app.data.changed',{domains}); } catch { /* notification is best effort; committed HTTP work is durable */ }
  },100);
  timer.unref?.();
}
function appLiveDataMiddleware(req,res,next) {
  res.setHeader?.("X-Cing-Live-Data", "v3");
  if(['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    const domains=domainsForMutation(req.originalUrl);
    if(domains.length)res.once('finish',()=>{if(res.statusCode>=200 && res.statusCode<300)schedule(domains);});
  }
  next();
}
module.exports={appLiveDataMiddleware,domainsForMutation};
