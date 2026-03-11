import "dotenv/config";
import { randomUUID } from "crypto";
import { db, products } from "./index";

const CATEGORIES = ["Electronics", "Books", "Clothing", "Home & Garden", "Sports", "Toys", "Food", "Beauty"];

const SAMPLE_PRODUCTS = [
  { name: "Wireless Mouse", category: "Electronics", price: 29.99 },
  { name: "Mechanical Keyboard", category: "Electronics", price: 89.99 },
  { name: "USB-C Hub", category: "Electronics", price: 49.99 },
  { name: "4K Monitor", category: "Electronics", price: 399.99 },
  { name: "Noise Cancelling Headphones", category: "Electronics", price: 199.99 },
  { name: "Webcam HD 1080p", category: "Electronics", price: 69.99 },
  { name: "Laptop Stand", category: "Electronics", price: 39.99 },
  { name: "Portable Charger 20000mAh", category: "Electronics", price: 44.99 },
  { name: "Smart Watch", category: "Electronics", price: 249.99 },
  { name: "Bluetooth Speaker", category: "Electronics", price: 59.99 },
  { name: "Clean Code", category: "Books", price: 34.99 },
  { name: "The Pragmatic Programmer", category: "Books", price: 44.99 },
  { name: "Design Patterns", category: "Books", price: 54.99 },
  { name: "You Don't Know JS", category: "Books", price: 29.99 },
  { name: "The DevOps Handbook", category: "Books", price: 39.99 },
  { name: "Running Shoes Pro", category: "Sports", price: 119.99 },
  { name: "Yoga Mat", category: "Sports", price: 24.99 },
  { name: "Resistance Bands Set", category: "Sports", price: 19.99 },
  { name: "Dumbbell Set 20kg", category: "Sports", price: 89.99 },
  { name: "Water Bottle 1L", category: "Sports", price: 14.99 },
  { name: "Cycling Helmet", category: "Sports", price: 64.99 },
  { name: "Jump Rope", category: "Sports", price: 9.99 },
  { name: "Cotton T-Shirt", category: "Clothing", price: 19.99 },
  { name: "Slim Fit Jeans", category: "Clothing", price: 49.99 },
  { name: "Hooded Sweatshirt", category: "Clothing", price: 39.99 },
  { name: "Winter Jacket", category: "Clothing", price: 129.99 },
  { name: "Casual Sneakers", category: "Clothing", price: 79.99 },
  { name: "Wool Socks 3-Pack", category: "Clothing", price: 12.99 },
  { name: "Coffee Maker", category: "Home & Garden", price: 79.99 },
  { name: "Air Purifier", category: "Home & Garden", price: 149.99 },
  { name: "Electric Kettle", category: "Home & Garden", price: 34.99 },
  { name: "Indoor Plant Pot Set", category: "Home & Garden", price: 24.99 },
  { name: "Scented Candle Set", category: "Home & Garden", price: 19.99 },
  { name: "Tool Kit 40-Piece", category: "Home & Garden", price: 44.99 },
  { name: "LEGO City Set", category: "Toys", price: 59.99 },
  { name: "Remote Control Car", category: "Toys", price: 34.99 },
  { name: "Board Game — Catan", category: "Toys", price: 44.99 },
  { name: "Puzzle 1000 Pieces", category: "Toys", price: 19.99 },
  { name: "Action Figure Set", category: "Toys", price: 24.99 },
  { name: "Organic Green Tea 100g", category: "Food", price: 12.99 },
  { name: "Dark Chocolate 85% 200g", category: "Food", price: 8.99 },
  { name: "Mixed Nuts 500g", category: "Food", price: 15.99 },
  { name: "Protein Powder 1kg", category: "Food", price: 39.99 },
  { name: "Olive Oil Extra Virgin 500ml", category: "Food", price: 14.99 },
  { name: "Face Moisturiser SPF50", category: "Beauty", price: 24.99 },
  { name: "Vitamin C Serum 30ml", category: "Beauty", price: 34.99 },
  { name: "Natural Shampoo 300ml", category: "Beauty", price: 14.99 },
  { name: "Electric Toothbrush", category: "Beauty", price: 59.99 },
  { name: "Sunscreen SPF50+ 100ml", category: "Beauty", price: 18.99 },
  { name: "Lip Balm Set 4-Pack", category: "Beauty", price: 9.99 },
];

async function seed() {
  console.log("Seeding 50 products...");

  const now = new Date().toISOString();
  const rows = SAMPLE_PRODUCTS.map((p) => ({
    id: randomUUID(),
    name: p.name,
    description: `${p.name} — high quality product in the ${p.category} category.`,
    price: p.price,
    category: p.category,
    stock: Math.floor(Math.random() * 200) + 1,
    createdAt: now,
    updatedAt: now,
  }));

  await db.insert(products).values(rows);
  console.log(`Done. Inserted ${rows.length} products.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
