const fs = require('fs');
const file = '/Users/style/cing-miniapp-frontend/src/features/checkout/pages/CheckoutPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// Tìm chỗ tạo cart_snapshot để thêm note
// Xem paymentSession tạo snapshot thế nào
const old = `        customer_name:    name,
        customer_phone:  memberPhone||phone,
        shipping_address:orderType==="delivery"?address:"",
        shipping_fee:    orderType==="delivery"?shipFee:0,
        points_used:     pointsToUse,`;

const newStr = `        customer_name:    name,
        customer_phone:  memberPhone||phone,
        shipping_address:orderType==="delivery"?address:"",
        shipping_fee:    orderType==="delivery"?shipFee:0,
        points_used:     pointsToUse,
        note:            note||"",`;

if (!content.includes(old)) {
  // Thử tìm pattern khác
  console.log('Pattern 1 not found, trying pattern 2...');
  const matches = content.match(/customer_name.*\n.*customer_phone.*\n.*shipping_address/);
  console.log('Match:', matches?.[0]?.substring(0,100));
  process.exit(1);
}

content = content.replace(old, newStr);

// Cũng thêm note vào orderPayload gửi lên /orders/create
content = content.replace(
  `        tier_discount:  tierDiscount,
        points_discount: pointsDiscount,`,
  `        tier_discount:  tierDiscount,
        points_discount: pointsDiscount,
        note:            note||"",`
);

fs.writeFileSync(file, content, 'utf8');
console.log('✅ note added to cart_snapshot and orderPayload');
