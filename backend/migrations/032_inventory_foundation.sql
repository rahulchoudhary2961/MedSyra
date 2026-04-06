CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'unit',
  reorder_level NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_org_active_name
  ON inventory_items (organization_id, is_active, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_org_code
  ON inventory_items (organization_id, code)
  WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  performed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_movements_type_check CHECK (
    movement_type IN ('stock_in', 'usage', 'wastage', 'adjustment_in', 'adjustment_out')
  ),
  CONSTRAINT inventory_movements_quantity_check CHECK (quantity > 0),
  CONSTRAINT inventory_movements_cost_check CHECK (unit_cost >= 0 AND total_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_item_date
  ON inventory_movements (organization_id, item_id, movement_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_type_date
  ON inventory_movements (organization_id, movement_type, movement_date DESC, created_at DESC);
