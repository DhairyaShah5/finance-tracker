// Hand-authored to match supabase/migrations/20260615120000_initial_schema.sql.
// Regenerate any time with:  supabase gen types typescript --linked > src/lib/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Timestamps = { created_at: string };
type WithUpdated = { updated_at: string };

export interface Database {
  public: {
    Tables: {
      settings: {
        Row: {
          id: string;
          user_id: string;
          currency: string;
          starting_funds: number;
          budget_months: number;
          savings_target: number;
          arrival_date: string | null;
          birth_date: string | null;
          debt_free_target_age: number;
        } & Timestamps & WithUpdated;
        Insert: {
          id?: string;
          user_id: string;
          currency?: string;
          starting_funds?: number;
          budget_months?: number;
          savings_target?: number;
          arrival_date?: string | null;
          birth_date?: string | null;
          debt_free_target_age?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["settings"]["Insert"]>;
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          bank: string;
          type: "checking" | "credit_card" | "savings" | "cash" | "investment";
          opening_balance: number;
          is_credit: boolean;
          include_in_net_worth: boolean;
          display_order: number;
          reconciled_through: string | null;
        } & Timestamps & WithUpdated;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          bank?: string;
          type?: "checking" | "credit_card" | "savings" | "cash" | "investment";
          opening_balance?: number;
          is_credit?: boolean;
          include_in_net_worth?: boolean;
          display_order?: number;
          reconciled_through?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color_hue: number | null;
          annual_budget: number | null;
          monthly_budget: number | null;
          budget_group: "needs" | "wants" | "savings" | null;
          linked_account_id: string | null;
          no_budget: boolean;
          display_order: number;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          color_hue?: number | null;
          annual_budget?: number | null;
          monthly_budget?: number | null;
          budget_group?: "needs" | "wants" | "savings" | null;
          linked_account_id?: string | null;
          no_budget?: boolean;
          display_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
        Relationships: [];
      };
      inflow_types: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          is_paycheck: boolean;
          display_order: number;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          is_paycheck?: boolean;
          display_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["inflow_types"]["Insert"]>;
        Relationships: [];
      };
      debtors: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          amount: number;
          note: string | null;
        } & Timestamps & WithUpdated;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          amount?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["debtors"]["Insert"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          txn_date: string;
          account_id: string;
          category_id: string | null;
          description: string;
          direction: "outflow" | "inflow";
          amount: number;
          inflow_type_id: string | null;
          whose_expense: "My" | "Friend" | "Group" | "Roommates" | null;
          debtor_id: string | null;
          is_transfer: boolean;
          split_count: number | null;
          my_share: number | null;
          budget_group: "needs" | "wants" | "savings" | null;
          reimbursable: boolean;
          reimbursed: boolean;
          reimbursed_amount: number;
          reimburses_id: string | null;
          notes: string | null;
        } & Timestamps & WithUpdated;
        Insert: {
          id?: string;
          user_id: string;
          txn_date: string;
          account_id: string;
          category_id?: string | null;
          description: string;
          direction: "outflow" | "inflow";
          amount: number;
          inflow_type_id?: string | null;
          whose_expense?: "My" | "Friend" | "Group" | "Roommates" | null;
          debtor_id?: string | null;
          is_transfer?: boolean;
          split_count?: number | null;
          my_share?: number | null;
          budget_group?: "needs" | "wants" | "savings" | null;
          reimbursable?: boolean;
          reimbursed?: boolean;
          reimbursed_amount?: number;
          reimburses_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
        Relationships: [];
      };
      india_transfers: {
        Row: {
          id: string;
          user_id: string;
          transfer_date: string;
          direction: "received" | "sent";
          description: string;
          endpoint: string | null;
          usd_amount: number;
          inr_amount: number;
          effective_fx_rate: number | null;
          notes: string | null;
          exclude_from_net_worth: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          transfer_date: string;
          direction: "received" | "sent";
          description: string;
          endpoint?: string | null;
          usd_amount: number;
          inr_amount: number;
          notes?: string | null;
          exclude_from_net_worth?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["india_transfers"]["Insert"]>;
        Relationships: [];
      };
      other_income: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          amount: number;
          received_date: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          label: string;
          amount: number;
          received_date?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["other_income"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}

// Convenience row aliases
type T = Database["public"]["Tables"];
export type SettingsRow = T["settings"]["Row"];
export type AccountRow = T["accounts"]["Row"];
export type CategoryRow = T["categories"]["Row"];
export type InflowTypeRow = T["inflow_types"]["Row"];
export type DebtorRow = T["debtors"]["Row"];
export type TransactionRow = T["transactions"]["Row"];
export type IndiaTransferRow = T["india_transfers"]["Row"];
export type OtherIncomeRow = T["other_income"]["Row"];
