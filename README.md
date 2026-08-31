# Neeros (Laptop End-to-End MVP)

This project is a laptop-ready returns processing app for a small business.

## What it includes

- Seller flow
  - Upload catalog CSV (one-time + periodic updates)
  - Upload packages CSV
  - Upload package-items CSV
  - View summary reports
- Processing flow
  - Open processing queue
  - Update package status
  - Scan package/items (manual, USB scanner, camera flow)
  - Record actual condition (New/Opened/Damaged)
- Admin flow
  - Full access to all pages

## Tech stack

- Next.js 12 + TypeScript (Node 14 compatible)
- Supabase-ready schema in supabase/migrations
- Local storage runtime for MVP simulation before Supabase wiring

## Run on Windows laptop

1. Ensure Node.js 14+ is installed (recommended to upgrade to Node 20 when possible).
2. Install dependencies:

```powershell
Set-Location C:/Engineering/Code/returns
npm install
```

3. Start development server:

```powershell
npm run dev
```

4. Open:

- http://localhost:8085/login

## Demo users

- admin@returns.local (admin)
- seller1@returns.local (seller)
- seller2@returns.local (seller)
- processor1@returns.local (processor)

## CSV expected columns

### Package Items

- Return Tracking Number
- Carrier
- Barcode (EAN/UPC)
- Artist
- Title
- Qty Expected
- Expected Condition
- Customer Return Reason
- Refund Amount (USD)
- Order Reference
- Return Requested Date
- Order Date

### Packages

- Return Tracking Number
- Carrier
- Distinct Items
- Total Units
- Total Refund (USD)
- Expected Conditions
- Order Reference(s)
- Earliest Return Requested

### Catalog

- Barcode (EAN/UPC)
- Artist
- Title
- Format
- Media Type
- Image URL

## Supabase migration

Run SQL from:

- supabase/migrations/001_init.sql

Set env values in .env.local based on .env.example.

## Notes

- This MVP stores runtime data in browser localStorage for quick laptop deployment.
- Next step is connecting the same flows to Supabase tables and storage buckets.
- Camera scan uses BarcodeDetector when browser supports it; USB scanner/manual input is always supported.
