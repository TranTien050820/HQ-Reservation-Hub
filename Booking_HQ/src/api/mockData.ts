import type {
  MenuCategory,
  MenuItem,
  ReservationBooking,
  ReservationDateOverride,
  ReservationPeriod,
  ReservationPeriodRule,
  ReservationZone,
  StoreInfo,
} from './types';

/** Fake data for the storefront — stands in until the HQ-WebOffice-API is wired up. */
export const SITE_ID = 2;

export const MOCK_STORES: StoreInfo[] = [
  {
    globalId: 101,
    siteId: SITE_ID,
    storenum: 1,
    snum: 1,
    description: 'The Olive & Stone',
    contact: 'Maria Lopez',
    phone: '(555) 010-1001',
    address1: '123 Main St',
    city: 'Springfield',
    prov: 'IL',
    country: 'USA',
    postal: '62701',
    email: 'hello@oliveandstone.example',
    website: 'https://oliveandstone.example',
  },
  {
    globalId: 102,
    siteId: SITE_ID,
    storenum: 2,
    snum: 2,
    description: 'Sakura Izakaya',
    contact: 'Kenji Tanaka',
    phone: '(555) 010-1002',
    address1: '88 Riverside Ave',
    city: 'Springfield',
    prov: 'IL',
    country: 'USA',
    postal: '62702',
    email: 'reserve@sakuraizakaya.example',
    website: 'https://sakuraizakaya.example',
  },
  {
    globalId: 103,
    siteId: SITE_ID,
    storenum: 3,
    snum: 3,
    description: 'Le Petit Bistro',
    contact: 'Claire Dubois',
    phone: '(555) 010-1003',
    address1: '47 Garden Lane',
    city: 'Springfield',
    prov: 'IL',
    country: 'USA',
    postal: '62703',
    email: 'bonjour@lepetitbistro.example',
    website: 'https://lepetitbistro.example',
  },
];

export const MOCK_ZONES: ReservationZone[] = [
  { globalId: 1, siteId: SITE_ID, sNum: 1, zoneID: 1, zoneName: 'Main Dining', isNoTable: 0, availableSlots: 12, isPauseBooking: 0, isActive: 1 },
  { globalId: 2, siteId: SITE_ID, sNum: 1, zoneID: 2, zoneName: 'Patio', isNoTable: 0, availableSlots: 6, isPauseBooking: 0, isActive: 1 },
  { globalId: 3, siteId: SITE_ID, sNum: 1, zoneID: 3, zoneName: 'Bar', isNoTable: 0, availableSlots: 0, isPauseBooking: 1, isActive: 1 },
  { globalId: 8, siteId: SITE_ID, sNum: 1, zoneID: 8, zoneName: 'Ven biển', isNoTable: 0, availableSlots: 8, isPauseBooking: 0, isActive: 1 },
  { globalId: 9, siteId: SITE_ID, sNum: 1, zoneID: 9, zoneName: 'Quầy bar', isNoTable: 0, availableSlots: 5, isPauseBooking: 0, isActive: 1 },

  { globalId: 4, siteId: SITE_ID, sNum: 2, zoneID: 4, zoneName: 'Counter Seating', isNoTable: 0, availableSlots: 8, isPauseBooking: 0, isActive: 1 },
  { globalId: 5, siteId: SITE_ID, sNum: 2, zoneID: 5, zoneName: 'Private Room', isNoTable: 0, availableSlots: 4, isPauseBooking: 0, isActive: 1 },
  { globalId: 10, siteId: SITE_ID, sNum: 2, zoneID: 10, zoneName: 'Ven biển', isNoTable: 0, availableSlots: 6, isPauseBooking: 0, isActive: 1 },
  { globalId: 11, siteId: SITE_ID, sNum: 2, zoneID: 11, zoneName: 'Quầy bar', isNoTable: 0, availableSlots: 5, isPauseBooking: 0, isActive: 1 },

  { globalId: 6, siteId: SITE_ID, sNum: 3, zoneID: 6, zoneName: 'Garden Terrace', isNoTable: 0, availableSlots: 10, isPauseBooking: 0, isActive: 1 },
  { globalId: 7, siteId: SITE_ID, sNum: 3, zoneID: 7, zoneName: 'Wine Cellar', isNoTable: 0, availableSlots: 5, isPauseBooking: 0, isActive: 1 },
  { globalId: 12, siteId: SITE_ID, sNum: 3, zoneID: 12, zoneName: 'Ven biển', isNoTable: 0, availableSlots: 7, isPauseBooking: 0, isActive: 1 },
  { globalId: 13, siteId: SITE_ID, sNum: 3, zoneID: 13, zoneName: 'Quầy bar', isNoTable: 0, availableSlots: 4, isPauseBooking: 0, isActive: 1 },
];

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function buildPeriods(sNum: number, basePeriodId: number, baseRuleId: number): {
  periods: ReservationPeriod[];
  rules: ReservationPeriodRule[];
} {
  const lunchID = basePeriodId;
  const dinnerID = basePeriodId + 1;

  const periods: ReservationPeriod[] = [
    { globalId: lunchID, siteId: SITE_ID, sNum, periodID: lunchID, periodName: 'Lunch', startTime: '11:00:00', endTime: '14:00:00', crossDay: 0, isActive: 1 },
    { globalId: dinnerID, siteId: SITE_ID, sNum, periodID: dinnerID, periodName: 'Dinner', startTime: '17:00:00', endTime: '22:00:00', crossDay: 0, isActive: 1 },
  ];

  const rules: ReservationPeriodRule[] = ALL_DAYS.flatMap((dayOfWeek, i) => [
    { globalId: baseRuleId + i * 2, siteId: SITE_ID, sNum, ruleID: baseRuleId + i * 2, periodID: lunchID, dayOfWeek, isActive: 1 },
    { globalId: baseRuleId + i * 2 + 1, siteId: SITE_ID, sNum, ruleID: baseRuleId + i * 2 + 1, periodID: dinnerID, dayOfWeek, isActive: 1 },
  ]);

  return { periods, rules };
}

const store1 = buildPeriods(1, 1, 1);
const store2 = buildPeriods(2, 10, 100);
const store3 = buildPeriods(3, 20, 200);

export const MOCK_PERIODS: ReservationPeriod[] = [...store1.periods, ...store2.periods, ...store3.periods];
export const MOCK_PERIOD_RULES: ReservationPeriodRule[] = [...store1.rules, ...store2.rules, ...store3.rules];

export const MOCK_DATE_OVERRIDES: ReservationDateOverride[] = [];

/** In-memory bookings store, mutated by createBooking / cancelBooking. */
export const MOCK_BOOKINGS: ReservationBooking[] = [
  {
    globalId: 9001,
    siteId: SITE_ID,
    sNum: 1,
    customerId: 1,
    bookingName: 'Jane Doe',
    bookingPhone: '5551234567',
    bookingEmail: 'jane@example.com',
    bookerName: 'Jane Doe',
    bookerPhone: '5551234567',
    bookerEmail: 'jane@example.com',
    reservationNo: 'RES-9001',
    reservationDate: '2026-06-14',
    reservationTime: '19:00:00',
    arrivalDateTime: '2026-06-14T19:00:00',
    partySize: 2,
    channelID: 1,
    zoneID: 1,
    status: 4,
    periodID: 2,
    customerNote: 'Window seat if possible',
    dateCreated: '2026-06-10T10:15:00',
  },
  {
    globalId: 9002,
    siteId: SITE_ID,
    sNum: 2,
    customerId: 1,
    bookingName: 'Jane Doe',
    bookingPhone: '5551234567',
    bookingEmail: 'jane@example.com',
    bookerName: 'Jane Doe',
    bookerPhone: '5551234567',
    bookerEmail: 'jane@example.com',
    reservationNo: 'RES-9002',
    reservationDate: '2026-05-01',
    reservationTime: '12:30:00',
    arrivalDateTime: '2026-05-01T12:30:00',
    partySize: 4,
    channelID: 1,
    zoneID: 4,
    status: 8,
    periodID: 10,
    customerNote: '',
    dateCreated: '2026-04-28T09:00:00',
  },
];

export const MOCK_MENU_CATEGORIES: MenuCategory[] = [
  // The Olive & Stone (sNum 1) — Modern American / Italian
  { globalId: 1001, siteId: SITE_ID, sNum: 1, categoryID: 1, nameEn: 'Appetizers', nameVi: 'Khai vị', sortOrder: 1 },
  { globalId: 1002, siteId: SITE_ID, sNum: 1, categoryID: 2, nameEn: 'Mains', nameVi: 'Món chính', sortOrder: 2 },
  { globalId: 1003, siteId: SITE_ID, sNum: 1, categoryID: 3, nameEn: 'Desserts', nameVi: 'Tráng miệng', sortOrder: 3 },
  { globalId: 1004, siteId: SITE_ID, sNum: 1, categoryID: 4, nameEn: 'Drinks', nameVi: 'Đồ uống', sortOrder: 4 },

  // Sakura Izakaya (sNum 2) — Japanese
  { globalId: 1011, siteId: SITE_ID, sNum: 2, categoryID: 11, nameEn: 'Small Plates', nameVi: 'Món nhỏ', sortOrder: 1 },
  { globalId: 1012, siteId: SITE_ID, sNum: 2, categoryID: 12, nameEn: 'Sushi & Sashimi', nameVi: 'Sushi & Sashimi', sortOrder: 2 },
  { globalId: 1013, siteId: SITE_ID, sNum: 2, categoryID: 13, nameEn: 'Mains', nameVi: 'Món chính', sortOrder: 3 },
  { globalId: 1014, siteId: SITE_ID, sNum: 2, categoryID: 14, nameEn: 'Drinks', nameVi: 'Đồ uống', sortOrder: 4 },

  // Le Petit Bistro (sNum 3) — French
  { globalId: 1021, siteId: SITE_ID, sNum: 3, categoryID: 21, nameEn: 'Starters', nameVi: 'Khai vị', sortOrder: 1 },
  { globalId: 1022, siteId: SITE_ID, sNum: 3, categoryID: 22, nameEn: 'Mains', nameVi: 'Món chính', sortOrder: 2 },
  { globalId: 1023, siteId: SITE_ID, sNum: 3, categoryID: 23, nameEn: 'Desserts', nameVi: 'Tráng miệng', sortOrder: 3 },
  { globalId: 1024, siteId: SITE_ID, sNum: 3, categoryID: 24, nameEn: 'Wine & Drinks', nameVi: 'Rượu vang & Đồ uống', sortOrder: 4 },
];

export const MOCK_MENU_ITEMS: MenuItem[] = [
  // The Olive & Stone — Appetizers
  { globalId: 2101, siteId: SITE_ID, sNum: 1, itemID: 101, categoryID: 1, nameEn: 'Burrata & Heirloom Tomato', nameVi: 'Burrata & Cà chua gia truyền', descriptionEn: 'Creamy burrata, basil oil, aged balsamic', descriptionVi: 'Burrata béo mịn, dầu húng quế, giấm balsamic ủ lâu năm', price: 14, isVegetarian: true, isSignature: true, isActive: 1 },
  { globalId: 2102, siteId: SITE_ID, sNum: 1, itemID: 102, categoryID: 1, nameEn: 'Crispy Calamari', nameVi: 'Mực chiên giòn', descriptionEn: 'Lemon aioli, chili flakes', descriptionVi: 'Sốt aioli chanh, ớt bột', price: 13, isSpicy: true, isActive: 1 },
  { globalId: 2103, siteId: SITE_ID, sNum: 1, itemID: 103, categoryID: 1, nameEn: 'Roasted Beet Salad', nameVi: 'Salad củ dền nướng', descriptionEn: 'Whipped goat cheese, candied walnuts, arugula', descriptionVi: 'Phô mai dê đánh kem, hạt óc chó tẩm đường, rau arugula', price: 12, isVegetarian: true, isActive: 1 },

  // The Olive & Stone — Mains
  { globalId: 2104, siteId: SITE_ID, sNum: 1, itemID: 104, categoryID: 2, nameEn: 'Wood-Fired Margherita Pizza', nameVi: 'Pizza Margherita nướng củi', descriptionEn: 'San Marzano tomato, fresh mozzarella, basil', descriptionVi: 'Cà chua San Marzano, mozzarella tươi, húng quế', price: 19, isVegetarian: true, isSignature: true, isActive: 1 },
  { globalId: 2105, siteId: SITE_ID, sNum: 1, itemID: 105, categoryID: 2, nameEn: 'Braised Short Rib', nameVi: 'Sườn bò hầm', descriptionEn: 'Red wine jus, parmesan polenta, charred greens', descriptionVi: 'Sốt rượu vang đỏ, polenta phô mai parmesan, rau xanh áp chảo', price: 32, isSignature: true, isActive: 1 },
  { globalId: 2106, siteId: SITE_ID, sNum: 1, itemID: 106, categoryID: 2, nameEn: 'Saffron Seafood Risotto', nameVi: 'Risotto hải sản nghệ tây', descriptionEn: 'Shrimp, mussels, calamari, saffron broth', descriptionVi: 'Tôm, vẹm, mực, nước dùng nghệ tây', price: 28, isActive: 1 },
  { globalId: 2107, siteId: SITE_ID, sNum: 1, itemID: 107, categoryID: 2, nameEn: 'Spicy Arrabbiata Pasta', nameVi: 'Mì Ý sốt Arrabbiata', descriptionEn: 'Tomato, garlic, chili, pecorino', descriptionVi: 'Cà chua, tỏi, ớt, phô mai pecorino', price: 21, isVegetarian: true, isSpicy: true, isActive: 1 },

  // The Olive & Stone — Desserts
  { globalId: 2108, siteId: SITE_ID, sNum: 1, itemID: 108, categoryID: 3, nameEn: 'Classic Tiramisu', nameVi: 'Tiramisu cổ điển', descriptionEn: 'Espresso-soaked ladyfingers, mascarpone', descriptionVi: 'Bánh quy đẫm cà phê espresso, kem mascarpone', price: 10, isVegetarian: true, isSignature: true, isActive: 1 },
  { globalId: 2109, siteId: SITE_ID, sNum: 1, itemID: 109, categoryID: 3, nameEn: 'Olive Oil Cake', nameVi: 'Bánh dầu olive', descriptionEn: 'Citrus glaze, whipped ricotta', descriptionVi: 'Phủ sốt cam quýt, kem ricotta đánh bông', price: 9, isVegetarian: true, isActive: 1 },

  // The Olive & Stone — Drinks
  { globalId: 2110, siteId: SITE_ID, sNum: 1, itemID: 110, categoryID: 4, nameEn: 'House Red Wine (glass)', nameVi: 'Rượu vang đỏ nhà hàng (ly)', descriptionEn: 'Italian blend, medium body', descriptionVi: 'Pha chế kiểu Ý, vị vừa', price: 11, isActive: 1 },
  { globalId: 2111, siteId: SITE_ID, sNum: 1, itemID: 111, categoryID: 4, nameEn: 'Sparkling Lemonade', nameVi: 'Nước chanh có gas', descriptionEn: 'Fresh lemon, mint, soda', descriptionVi: 'Chanh tươi, bạc hà, soda', price: 6, isVegetarian: true, isActive: 1 },

  // Sakura Izakaya — Small Plates
  { globalId: 2201, siteId: SITE_ID, sNum: 2, itemID: 201, categoryID: 11, nameEn: 'Edamame', nameVi: 'Đậu nành Nhật', descriptionEn: 'Steamed, sea salt', descriptionVi: 'Hấp, muối biển', price: 6, isVegetarian: true, isActive: 1 },
  { globalId: 2202, siteId: SITE_ID, sNum: 2, itemID: 202, categoryID: 11, nameEn: 'Karaage Fried Chicken', nameVi: 'Gà chiên Karaage', descriptionEn: 'Japanese fried chicken, yuzu mayo', descriptionVi: 'Gà chiên kiểu Nhật, sốt mayo yuzu', price: 12, isSignature: true, isActive: 1 },
  { globalId: 2203, siteId: SITE_ID, sNum: 2, itemID: 203, categoryID: 11, nameEn: 'Spicy Tuna Tartare', nameVi: 'Gỏi cá ngừ cay', descriptionEn: 'Sesame oil, scallion, crispy wonton', descriptionVi: 'Dầu mè, hành lá, bánh wonton giòn', price: 14, isSpicy: true, isActive: 1 },

  // Sakura Izakaya — Sushi & Sashimi
  { globalId: 2204, siteId: SITE_ID, sNum: 2, itemID: 204, categoryID: 12, nameEn: 'Salmon Nigiri (2 pcs)', nameVi: 'Nigiri cá hồi (2 miếng)', descriptionEn: 'Fresh Norwegian salmon', descriptionVi: 'Cá hồi Na Uy tươi', price: 8, isSignature: true, isActive: 1 },
  { globalId: 2205, siteId: SITE_ID, sNum: 2, itemID: 205, categoryID: 12, nameEn: 'Rainbow Roll', nameVi: 'Cuốn Rainbow', descriptionEn: 'Crab, avocado, assorted fish', descriptionVi: 'Cua, bơ, cá tổng hợp', price: 16, isActive: 1 },
  { globalId: 2206, siteId: SITE_ID, sNum: 2, itemID: 206, categoryID: 12, nameEn: 'Vegetable Roll', nameVi: 'Cuốn rau củ', descriptionEn: 'Cucumber, avocado, pickled radish', descriptionVi: 'Dưa leo, bơ, củ cải ngâm', price: 10, isVegetarian: true, isActive: 1 },

  // Sakura Izakaya — Mains
  { globalId: 2207, siteId: SITE_ID, sNum: 2, itemID: 207, categoryID: 13, nameEn: 'Miso Glazed Black Cod', nameVi: 'Cá tuyết đen sốt miso', descriptionEn: 'Sweet miso glaze, steamed rice', descriptionVi: 'Sốt miso ngọt, cơm trắng', price: 29, isSignature: true, isActive: 1 },
  { globalId: 2208, siteId: SITE_ID, sNum: 2, itemID: 208, categoryID: 13, nameEn: 'Tonkotsu Ramen', nameVi: 'Ramen Tonkotsu', descriptionEn: 'Pork broth, chashu, soft egg, scallion', descriptionVi: 'Nước hầm xương heo, chashu, trứng lòng đào, hành lá', price: 18, isActive: 1 },
  { globalId: 2209, siteId: SITE_ID, sNum: 2, itemID: 209, categoryID: 13, nameEn: 'Spicy Mapo Tofu', nameVi: 'Đậu hũ Mapo cay', descriptionEn: 'Silken tofu, chili bean sauce', descriptionVi: 'Đậu hũ non, sốt đậu tương ớt', price: 15, isVegetarian: true, isSpicy: true, isActive: 1 },

  // Sakura Izakaya — Drinks
  { globalId: 2210, siteId: SITE_ID, sNum: 2, itemID: 210, categoryID: 14, nameEn: 'Junmai Sake (carafe)', nameVi: 'Rượu Sake Junmai (bình)', descriptionEn: 'Smooth, dry, served warm or cold', descriptionVi: 'Vị mượt, khô, dùng nóng hoặc lạnh', price: 16, isActive: 1 },
  { globalId: 2211, siteId: SITE_ID, sNum: 2, itemID: 211, categoryID: 14, nameEn: 'Iced Green Tea', nameVi: 'Trà xanh đá', descriptionEn: 'Unsweetened sencha', descriptionVi: 'Trà sencha không đường', price: 4, isVegetarian: true, isActive: 1 },

  // Le Petit Bistro — Starters
  { globalId: 2301, siteId: SITE_ID, sNum: 3, itemID: 301, categoryID: 21, nameEn: 'French Onion Soup', nameVi: 'Súp hành Pháp', descriptionEn: 'Gruyère crouton, caramelized onions', descriptionVi: 'Bánh mì nướng gruyère, hành caramen', price: 11, isSignature: true, isActive: 1 },
  { globalId: 2302, siteId: SITE_ID, sNum: 3, itemID: 302, categoryID: 21, nameEn: 'Escargots de Bourgogne', nameVi: 'Ốc sên Bourgogne', descriptionEn: 'Garlic herb butter, baguette', descriptionVi: 'Bơ tỏi thảo mộc, bánh mì baguette', price: 15, isActive: 1 },
  { globalId: 2303, siteId: SITE_ID, sNum: 3, itemID: 303, categoryID: 21, nameEn: 'Endive & Walnut Salad', nameVi: 'Salad rau diếp xoăn & hạt óc chó', descriptionEn: 'Roquefort, candied walnuts, sherry vinaigrette', descriptionVi: 'Phô mai Roquefort, hạt óc chó tẩm đường, sốt giấm sherry', price: 12, isVegetarian: true, isActive: 1 },

  // Le Petit Bistro — Mains
  { globalId: 2304, siteId: SITE_ID, sNum: 3, itemID: 304, categoryID: 22, nameEn: 'Coq au Vin', nameVi: 'Gà hầm rượu vang', descriptionEn: 'Braised chicken, red wine, mushrooms, lardons', descriptionVi: 'Gà hầm rượu vang đỏ, nấm, thịt ba chỉ muối', price: 27, isSignature: true, isActive: 1 },
  { globalId: 2305, siteId: SITE_ID, sNum: 3, itemID: 305, categoryID: 22, nameEn: 'Steak Frites', nameVi: 'Bò bít tết khoai chiên', descriptionEn: 'Grilled hanger steak, herb butter, fries', descriptionVi: 'Bít tết nướng, bơ thảo mộc, khoai tây chiên', price: 31, isSignature: true, isActive: 1 },
  { globalId: 2306, siteId: SITE_ID, sNum: 3, itemID: 306, categoryID: 22, nameEn: 'Ratatouille', nameVi: 'Ratatouille', descriptionEn: 'Provençal stewed vegetables, herbes de Provence', descriptionVi: 'Rau củ hầm kiểu Provence, thảo mộc Provence', price: 19, isVegetarian: true, isActive: 1 },

  // Le Petit Bistro — Desserts
  { globalId: 2307, siteId: SITE_ID, sNum: 3, itemID: 307, categoryID: 23, nameEn: 'Crème Brûlée', nameVi: 'Crème Brûlée', descriptionEn: 'Vanilla custard, caramelized sugar', descriptionVi: 'Kem trứng vani, đường caramen', price: 9, isVegetarian: true, isSignature: true, isActive: 1 },
  { globalId: 2308, siteId: SITE_ID, sNum: 3, itemID: 308, categoryID: 23, nameEn: 'Chocolate Soufflé', nameVi: 'Soufflé chocolate', descriptionEn: 'Warm chocolate soufflé, vanilla ice cream', descriptionVi: 'Soufflé chocolate nóng, kem vani', price: 11, isVegetarian: true, isActive: 1 },

  // Le Petit Bistro — Wine & Drinks
  { globalId: 2309, siteId: SITE_ID, sNum: 3, itemID: 309, categoryID: 24, nameEn: 'Bordeaux Red (glass)', nameVi: 'Vang đỏ Bordeaux (ly)', descriptionEn: 'Full-bodied, notes of cassis and oak', descriptionVi: 'Vị đậm đà, hương cassis và gỗ sồi', price: 13, isActive: 1 },
  { globalId: 2310, siteId: SITE_ID, sNum: 3, itemID: 310, categoryID: 24, nameEn: 'Kir Royale', nameVi: 'Kir Royale', descriptionEn: 'Champagne, crème de cassis', descriptionVi: 'Champagne, rượu crème de cassis', price: 14, isActive: 1 },
];

let nextBookingId = 9100;

export function nextMockBookingId(): number {
  nextBookingId += 1;
  return nextBookingId;
}
