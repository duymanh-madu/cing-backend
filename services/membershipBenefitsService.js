/**
 * Chính sách hội viên Cing Hu Tang Kinh Bắc
 * 
 * Hạng          | Tích điểm | Giảm giá bill
 * --------------|-----------|---------------
 * Hội viên      | 10%       | 0%
 * Thân thiết    | 10%       | 1%
 * Bạc           | 10%       | 2%
 * Vàng          | 10%       | 3%
 * Kim Cương     | 10%       | 5%
 * Đối tác       | 10%       | 3%
 * Đối tác TT    | 15%       | 5%
 */

const TIER_BENEFITS = {
  member:       { point_rate: 0.10, discount_rate: 0.00, label: "Hội viên" },
  loyal:        { point_rate: 0.10, discount_rate: 0.01, label: "Hội viên Thân Thiết" },
  silver:       { point_rate: 0.10, discount_rate: 0.02, label: "Hội viên Bạc" },
  gold:         { point_rate: 0.10, discount_rate: 0.03, label: "Hội viên Vàng" },
  diamond:      { point_rate: 0.10, discount_rate: 0.05, label: "Hội viên Kim Cương" },
  partner:      { point_rate: 0.10, discount_rate: 0.03, label: "Đối tác" },
  loyal_partner:{ point_rate: 0.15, discount_rate: 0.05, label: "Đối tác Thân Thiết" },
};

/**
 * Lấy quyền lợi theo tier
 */
function getTierBenefits(tierKey) {
  return TIER_BENEFITS[tierKey] || TIER_BENEFITS.member;
}

/**
 * Tính giảm giá cho đơn hàng
 * @param {number} subtotal - Tổng tiền trước giảm giá
 * @param {string} tierKey  - Hạng thành viên
 * @returns {{ discount_amount, discount_rate, final_amount }}
 */
function calculateOrderDiscount(subtotal, tierKey) {
  const benefits      = getTierBenefits(tierKey);
  const discount_rate = benefits.discount_rate;
  const discount_amount = Math.floor(subtotal * discount_rate);
  const final_amount  = subtotal - discount_amount;
  return { discount_amount, discount_rate, final_amount };
}

/**
 * Tính điểm tích lũy từ đơn hàng
 * Điểm tính theo số tiền THỰC CHI (sau giảm giá)
 * 1.000đ = 1 điểm
 * @param {number} final_amount - Số tiền thực chi sau giảm giá
 * @param {string} tierKey      - Hạng thành viên
 * @returns {number} points
 */
function calculateOrderPoints(final_amount, tierKey) {
  const benefits   = getTierBenefits(tierKey);
  const point_rate = benefits.point_rate;
  // point_rate = 10% → 100.000đ → 10.000 điểm tích → 10 điểm (1đ = 1.000đ)
  const points = Math.floor((final_amount * point_rate) / 1000);
  return points;
}

module.exports = {
  TIER_BENEFITS,
  getTierBenefits,
  calculateOrderDiscount,
  calculateOrderPoints,
};
