/**
 * seed.js — Populate the SQLite database with all 42 real 2026 incomplete orders
 * Run with: node seed.js
 */

const { upsertOrder, db } = require('./database');

// Helper: split combined artworkTitle into artwork + frame
function splitArtwork(combined) {
  const parts = combined.split(' // ');
  const artwork = parts[0].trim();
  // Everything after the first item could be frame / additional items
  const frame = parts.slice(1).join(', ').trim();
  return { artwork, frame };
}

const RAW_ORDERS = [
  // orderId | customerName | email | total | artworkTitle | couponCode | date
  ['105596', 'Richard Morganelli',    'shopcraft1@gmaol.com',                 333.99, 'A Bust of an Old Man',                                                                                    'TAKE30',         '04/01/2026'],
  ['105587', 'Lizette Aceves',        'lizetteace@gmail.com',                 369.60, 'The Monk by the Sea // Regency Gold Frame 24"X36"',                                                       'TAKE30',         '03/28/2026'],
  ['105545', 'Robert Costa',          'robertc@costaeng.com',                 716.93, 'Two Cypresses // New Age Black Frame 20"X24" // Kiss in the Garden // Athenian Gold Frame 20"X24"',        '',               '03/21/2026'],
  ['105543', 'Usan Oliver',           'usamils@gmail.com',                    159.20, 'View of Venice, Fog',                                                                                     '',               '03/21/2026'],
  ['105533', 'Tiffany Yan',           'tiffany.yan@utexas.edu',               209.30, 'Dance Studio at the Opera // Gold Luminoso Frame 20"X24"',                                                'TAKE30',         '03/18/2026'],
  ['105518', 'Maria Holtkamp',        'maria.holtkamp@att.net',               190.80, 'Two Cypresses Gallery Wrap',                                                                              'Joingift20',     '03/17/2026'],
  ['105513', 'Sheila Binas',          'sheilabinas@yahoo.com',                 99.00, 'Girl with a Pearl Earring',                                                                               '',               '03/17/2026'],
  ['105506', 'Louis Musetti',         'dadiopadio@gmail.com',                 125.30, 'Cafe Terrace at Night',                                                                                   'HOLIDAY30',      '03/16/2026'],
  ['105479', 'Mario Falcon',          '979falcon@gnail.com',                  208.00, 'Corner of the Garden at Montgeron // Gold Luminoso Frame 8"x10"',                                         '',               '03/14/2026'],
  ['105477', 'Elizabeth Palmer',      'epalmernd95@comcast.net',              289.00, 'Frederike Beer, 1914',                                                                                    '',               '03/14/2026'],
  ['105459', 'Amy Clark',             'amy03clark@gmail.com',                 119.00, 'Verona Champagne Braid Frame 8"X10"',                                                                     '',               '03/13/2026'],
  ['105443', 'Sky Yang',              'Samuelzhu17@gmail.com',                143.20, 'Starry Night',                                                                                            'WELCOMEPARTY20', '03/09/2026'],
  ['105422', 'Raven Enders',          'ravenenders690@gmail.com',             279.00, 'Niijuku Ferry, No. 93 from One Hundred Famous Views of Edo',                                              '',               '03/04/2026'],
  ['105383', 'Tracy Sandell',         'tsandell@live.com',                    334.40, 'Blue Nude (Femme nue II) // Ophelia',                                                                     'welcomeparty2',  '02/26/2026'],
  ['105364', 'Mateo Lisk',            'mateolisk@gmail.com',                  299.50, 'Skull of a Skeleton with Burning Cigarette // Regency Gold Frame 20"X24"',                                'TAKE30',         '02/24/2026'],
  ['105362', 'Mateo Lisk',            'mateolisk@gmail.com',                  307.02, 'Skull of a Skeleton with Burning Cigarette // Verona Gold Braid Frame 20"X24"',                           'TAKE30',         '02/24/2026'],
  ['105350', 'Phyllis Maas',          'phyllismmaas@gmail.com',               179.00, 'The Garden at Pontoise',                                                                                  '',               '02/22/2026'],
  ['105347', 'Matthew Costa',         'drmatthewcosta@gmail.com',             271.60, 'Two Cypresses // Regency Gold Frame 20"X24"',                                                             'LUXEART30',      '02/19/2026'],
  ['105342', 'Maleah Williams',       'maleah.williamsgreen@gmail.com',        99.00, 'Wheat Field With Crows',                                                                                  '',               '02/14/2026'],
  ['105337', 'Austin Sandage',        'sandagea2@gmail.com',                  259.44, 'Impression, Sunrise',                                                                                     '',               '02/10/2026'],
  ['105335', 'Joe Stampone',          'joe.stampone@gmail.com',               368.00, 'Cliff Walk at Pourville // Gold Luminoso Frame 20"X24"',                                                  '',               '02/09/2026'],
  ['105334', 'Joe Stampone',          'joe.stampone@gmail.com',               368.00, 'Cliff Walk at Pourville // Athenian Gold Frame 20"X24"',                                                  '',               '02/09/2026'],
  ['105333', 'Dennis Merrill',        'dennypat66@comcast.net',                72.89, 'Girl with a Pearl Earring',                                                                               '',               '02/08/2026'],
  ['105332', 'Susan Girardo',         'susanwiersema86@gmail.com',            367.00, 'The Little Owl // Skull of a Skeleton with Burning Cigarette',                                            '',               '02/08/2026'],
  ['105331', 'Susan Girardo',         'susanwiersema86@gmail.com',            188.00, 'The Little Owl',                                                                                         '',               '02/08/2026'],
  ['105329', 'Brian Cowell',          'bcowell10@hotmail.com',                406.66, 'Mademoiselle Gachet in her garden at Auvers sur oise',                                                   '',               '02/08/2026'],
  ['105321', 'Crystal Taitt',         'cayers@ptd.net',                       137.26, 'Verona Gold Braid Frame 20"X24"',                                                                        'WELCOMEPARTY20', '02/01/2026'],
  ['105320', 'Rachel Sasson',         'davidsasson@gmail.com',                417.10, 'Two Cypresses // Verona Champagne Braid Frame 20"X24"',                                                  '',               '01/30/2026'],
  ['105316', 'Trish Vu',              'tvu3417@gmail.com',                    281.76, 'Starry Night Wave Collage // Regency Gold Frame 20"X24"',                                                 'welcomeparty20', '01/24/2026'],
  ['105315', 'Trish Vu',              'tvu3417@gmail.com',                    390.40, 'Group IV, The Ten Largest, No. 4, Youth // Gold Luminoso Frame 24" x 36"',                               'welcomeparty20', '01/23/2026'],
  ['105312', 'Chiluchile Mwape',      'VICMWAPE777@hotmail.com',              249.00, 'Lilac Irises',                                                                                           '',               '01/21/2026'],
  ['105310', 'Michelle McGarrity',    'michelle227744@gmail.com',             208.00, 'Crown Imperial Fritillaries in a Copper Vase // Regency Gold Frames 8"X10"',                              '',               '01/19/2026'],
  ['105304', 'Tick Miller',           'millerrick369@gmail.com',              159.00, 'Cafe Terrace at Night',                                                                                   '',               '01/13/2026'],
  ['105303', 'Tick Miller',           'millerrick369@gmail.com',              388.00, 'Cafe Terrace at Night // Regency Gold Frame 20"X24"',                                                     '',               '01/13/2026'],
  ['105302', 'Matt Kindberg',         'makindberg@gmail.com',                 388.00, 'Cafe Terrace at Night // Regency Gold Frame 20"X24"',                                                     '',               '01/13/2026'],
  ['105300', 'Jeffrey Tolley',        'jefftolley0926@gmail.com',             218.00, 'Dancers in Repose // Star Dancer (On Stage)',                                                             '',               '01/13/2026'],
  ['105299', 'Anna Melka',            'imyouracid@gmail.com',                 339.00, 'The Japanese Bridge (The Water-Lily Pond, Water Irises)',                                                 '',               '01/13/2026'],
  ['105298', 'Jeffrey Tolley',        'jefftolley0926@gmail.com',             218.00, 'Star Dancer (On Stage) // Dancers in Repose',                                                            '',               '01/12/2026'],
  ['105296', 'Leon Petcov',           'lpetcovcommercialmg@yahoo.com',        388.00, 'Bordighera // Verona Gold Braid Frame 20"X24"',                                                          '',               '01/09/2026'],
  ['105290', 'Connie Renouard',       'connierenouard1@gmail.com',            167.30, 'MOR2596',                                                                                                'WELCOME30',      '01/04/2026'],
  ['105285', 'Kathleen Buckley',      'kbuckley12866@gmail.com',              199.00, 'FB7660',                                                                                                 '',               '01/01/2026'],
  ['105283', 'Mihaiela Gugiu',        'Mristei@yahoo.com',                    218.00, 'JF7106',                                                                                                 '',               '01/01/2026'],
];

console.log(`Seeding ${RAW_ORDERS.length} orders into database...\n`);

let inserted = 0;
let updated = 0;

for (const [orderId, customerName, email, total, artworkFull, couponCode, date] of RAW_ORDERS) {
  const { artwork, frame } = splitArtwork(artworkFull);

  // Convert MM/DD/YYYY → YYYY-MM-DD for consistent date storage
  const [mm, dd, yyyy] = date.split('/');
  const dateAdded = `${yyyy}-${mm}-${dd}`;

  const paymentLink = `https://www.overstockart.com/checkout`;

  const existing = db.prepare('SELECT id FROM orders WHERE order_id = ?').get(orderId);

  upsertOrder({
    order_id:      orderId,
    customer_name: customerName,
    customer_email: email,
    artwork,
    frame:         frame || null,
    order_total:   total,
    coupon_code:   couponCode || null,
    payment_link:  paymentLink,
    order_type:    'Incomplete Checkout',
    status:        'New',
    notes:         couponCode ? `Coupon available: ${couponCode}` : null,
    date_added:    dateAdded,
  });

  if (existing) {
    updated++;
    console.log(`  UPDATED  #${orderId} — ${customerName}`);
  } else {
    inserted++;
    console.log(`  INSERTED #${orderId} — ${customerName} — ${artwork.substring(0, 40)}${artwork.length > 40 ? '…' : ''} — $${total}`);
  }
}

console.log(`\n✅ Done! ${inserted} inserted, ${updated} updated.`);
console.log(`   Total orders in DB: ${db.prepare('SELECT COUNT(*) as c FROM orders').get().c}`);
console.log(`   Total pipeline value: $${db.prepare("SELECT ROUND(SUM(order_total),2) as t FROM orders WHERE status NOT IN ('Paid','Cancelled')").get().t}`);

db.close();
