# Security Specification - Arraiâ do Lar São Cristóvão

## 1. Data Invariants
- Orders must have a valid ticket number and at least one item.
- Users can only access views they are allowed to (managed by `allowed_views`).
- Stock movements must refer to an existing menu item.
- Admin role is required for managing users, categories, and full dashboard access.

## 2. The "Dirty Dozen" Payloads
1. Create an order with a future timestamp.
2. Update another user's password.
3. Delete a category without being an admin.
4. Create a menu item with a negative price.
5. Update an order's status to 'closed' without being an admin.
6. Inject a massive string into a ticket number.
7. Modify `stock_quantity` directly in `menu_items` without a `stock_history` entry.
8. Create a user with 'admin' role while being a 'staff' user.
9. List all users while being 'staff'.
10. Delete an order that is already 'delivered'.
11. Update `created_at` timestamp of an existing order.
12. Create an order without any items.

## 3. Test Runner
(This will be implemented in firestore.rules.test.ts)
