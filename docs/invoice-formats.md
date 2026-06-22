# By the C — Invoice formats (decoded)

> Single source of truth for the two invoice layouts and the LOCKED seasonal
> formula. The math lives in `src/lib/invoice-formula.ts` and is enforced
> server-side in `src/app/(painel)/invoices/actions.ts`. If you change the math,
> re-verify against the two worked examples at the bottom.

There are two invoice kinds. The `invoices.kind` column is the discriminator
(`'service'` | `'seasonal'`).

---

## 1. SERVICE invoice (maintenance / long-term)

Real sample: **#141**. Numbering uses `service_invoice_number_seq` (starts at 142).

Header: **By The C Realty / Service Invoice** + company block.

- **BILL TO** = the client (name, email, phone, billing address). Pulled from the
  `clients` row.
- **SERVICE ADDRESS** = the property address. If the job is on a saved property,
  use `property.address`; otherwise the typed `invoices.service_address`.
- **Line items**: each is Description + Amount, tagged **Labor** or **Material**
  (`invoice_items.category` = `'labor' | 'material'`).
- **Totals**: **Total Labor**, **Total Material**, **Total** ( = labor + material ).
  Stored on the invoice as `labor_total` and `material_total`.
- **Due**: "When Received".

All service line items are stored with `invoice_items.type = 'charge'`,
`guest = false`, `owner = false`, and `category` set.

---

## 2. SEASONAL invoice (Airbnb / VRBO) — LOCKED FORMULA

Real samples: **#335**, **#240**. Numbering uses `invoice_number_seq` (at 336).

Header: **By the C** brand + INVOICE #, Date, **Platform** (Airbnb / VRBO).

- **INVOICE TO** = the owner (a client).
- **RESERVATION DETAILS**: Guest name, Dates reserved (start–end), Property,
  Nights.
- Two columns, rendered from `invoice_items` (guest / owner flags):

### Paid by Guest
- Rental Nights (`room_fee`)
- Rental Discount (`rental_discount`, subtracted)
- Cleaning Fee (`cleaning_fee`)
- Guest Service Fee (`guest_service_fee`)
- Occupancy / Lodging Taxes (`occupancy_taxes`; VRBO stores a copy in `lodging_taxes_vrbo`)
- (VRBO only) Property Damage Protection (`vrbo_property_damage`)
- → **Total Paid by Guest** (`total_paid_by_guest`)

### Owner Overview
- Host Payout (`host_payout`)
- Cleaning Fee (`cleaning_fee`) — deducted **only if** `cleaning_goes_to = 'bythec'`
- Platform Host Service Fee (`host_service_fee`, deducted)
- By the C Commission (`bythec_commission`, deducted)
- Extra deductions (e.g. "Hot Tub Maintenance") — stored as owner line items
- → **Total Received by Owner** (`total_received_by_owner`)

### Exact formula (TRAVADA)

```
total_paid_by_guest =
    room_fee
  − rental_discount
  + cleaning_fee
  + guest_service_fee
  + occupancy_taxes
  ( + vrbo_property_damage  if VRBO )

bythec_commission = round( commission_rate × total_paid_by_guest , 2 )
  commission_rate comes from the PROPERTY (properties.seasonal_commission_rate,
  default 0.10) and is editable per invoice (one of the 2 always-asked unknowns).

total_received_by_owner =
    host_payout
  − host_service_fee
  − bythec_commission
  − ( cleaning_fee  IF cleaning_goes_to = 'bythec'  ELSE 0 )
  − sum( extra_deductions )
```

The two always-asked unknowns (never invented):
1. **By the C commission %** — defaults from the property, confirmed per invoice.
2. **Cleaning fee destination** (`cleaning_goes_to`: owner keeps / By the C keeps).

### Worked example A — #335 (Airbnb)
- Inputs: room 1995, discount 0, cleaning 350, guest_service 0, occ_tax 409.20;
  host_payout 2345, host_service_fee 351.75, commission 10%,
  cleaning_goes_to = owner (NOT deducted), extra "Hot Tub Maintenance" 80.
- **Total Paid by Guest** = 1995 − 0 + 350 + 0 + 409.20 = **2754.20**
- **By the C Commission** = 10% × 2754.20 = **275.42**
- **Total Received by Owner** = 2345 − 351.75 − 275.42 − 0 − 80 = **1637.83**

### Worked example B — #240 (Airbnb)
- Inputs: room 5313, discount 0, cleaning 350, guest_service 799.49,
  occ_tax 1127.70; host_payout 5663, host_service_fee 169.89, commission 10%,
  cleaning_goes_to = bythec (deducted 350), no extras.
- **Total Paid by Guest** = 5313 + 350 + 799.49 + 1127.70 = **7590.19**
- **By the C Commission** = 10% × 7590.19 = **759.02**
- **Total Received by Owner** = 5663 − 169.89 − 759.02 − 350 − 0 = **4384.09**

Both are reproduced exactly by `computeSeasonal()`.

---

## Numbering (migration 0008)

- Two independent sequences: `invoice_number_seq` (seasonal, @336) and
  `service_invoice_number_seq` (service, @142).
- Because the two sequences will eventually overlap, uniqueness is per kind:
  `unique (kind, invoice_number)` (the old global unique was dropped).
- A `BEFORE INSERT` trigger (`assign_invoice_number`) sets the number from the
  right sequence when `invoice_number` is null — atomic, no app race.

## Access (RLS, migration 0005)

- `financials.full` → all invoices (seasonal + service).
- `invoices.service` (secretary) → service invoices ONLY (create + view).
  Seasonal is hidden in the UI and blocked by RLS.

## PDF

- V1: browser **Print / Save as PDF**. The detail page ships print CSS that hides
  the sidebar and action buttons, printing only the branded invoice sheet.
- Future: server-side PDF generation (storage bucket `invoice-pdfs`, column
  `invoices.pdf_url` already exists) for emailing without the browser.
