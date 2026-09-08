export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          event: string
          id: string
          props: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          props?: Json | null
          user_id?: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          props?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          currency: string
          default_rate: number | null
          email: string | null
          id: string
          is_archived: boolean
          name: string
          notes: string | null
          tax_label: string | null
          tax_rate: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          currency?: string
          default_rate?: number | null
          email?: string | null
          id?: string
          is_archived?: boolean
          name: string
          notes?: string | null
          tax_label?: string | null
          tax_rate?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          currency?: string
          default_rate?: number | null
          email?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          notes?: string | null
          tax_label?: string | null
          tax_rate?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoice_line_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          hours: number
          id: string
          invoice_id: string
          rate: number
          sort_order: number
          task_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          hours: number
          id?: string
          invoice_id: string
          rate: number
          sort_order?: number
          task_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          hours?: number
          id?: string
          invoice_id?: string
          rate?: number
          sort_order?: number
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_rollups"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "invoice_line_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_templates: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          original_filename: string | null
          placeholders: Json | null
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          original_filename?: string | null
          placeholders?: Json | null
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          original_filename?: string | null
          placeholders?: Json | null
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          client_id: string
          created_at: string
          currency: string
          docx_path: string | null
          due_date: string | null
          id: string
          invoice_number: string
          issued_date: string | null
          notes: string | null
          pdf_path: string | null
          period_end: string | null
          period_start: string | null
          project_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_label: string | null
          tax_rate: number
          template_id: string | null
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          currency?: string
          docx_path?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          issued_date?: string | null
          notes?: string | null
          pdf_path?: string | null
          period_end?: string | null
          period_start?: string | null
          project_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_label?: string | null
          tax_rate?: number
          template_id?: string | null
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          currency?: string
          docx_path?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          issued_date?: string | null
          notes?: string | null
          pdf_path?: string | null
          period_end?: string | null
          period_start?: string | null
          project_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_label?: string | null
          tax_rate?: number
          template_id?: string | null
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_rollups"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      paddle_events: {
        Row: {
          event_id: string
          event_type: string | null
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type?: string | null
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string | null
          processed_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          budget_amount: number | null
          budget_seconds: number | null
          client: string | null
          client_id: string | null
          code: string | null
          color: string
          created_at: string
          ends_on: string | null
          id: string
          is_archived: boolean
          is_billable: boolean
          name: string
          notes: string | null
          rate: number | null
          starts_on: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_amount?: number | null
          budget_seconds?: number | null
          client?: string | null
          client_id?: string | null
          code?: string | null
          color?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          is_archived?: boolean
          is_billable?: boolean
          name: string
          notes?: string | null
          rate?: number | null
          starts_on?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_amount?: number | null
          budget_seconds?: number | null
          client?: string | null
          client_id?: string | null
          code?: string | null
          color?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          is_archived?: boolean
          is_billable?: boolean
          name?: string
          notes?: string | null
          rate?: number | null
          starts_on?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          paddle_customer_id: string | null
          paddle_subscription_id: string | null
          plan: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          plan?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          plan?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          estimate_seconds: number | null
          id: string
          is_billable: boolean
          name: string
          parent_id: string | null
          priority: string | null
          project_id: string
          sort_order: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimate_seconds?: number | null
          id?: string
          is_billable?: boolean
          name: string
          parent_id?: string | null
          priority?: string | null
          project_id: string
          sort_order?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimate_seconds?: number | null
          id?: string
          is_billable?: boolean
          name?: string
          parent_id?: string | null
          priority?: string | null
          project_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "task_rollups"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_rollups"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          invoice_id: string | null
          is_billable: boolean
          notes: string | null
          started_at: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          invoice_id?: string | null
          is_billable?: boolean
          notes?: string | null
          started_at?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          invoice_id?: string | null
          is_billable?: boolean
          notes?: string | null
          started_at?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_rollups"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      project_rollups: {
        Row: {
          billable_seconds: number | null
          entry_count: number | null
          project_id: string | null
          project_name: string | null
          task_count: number | null
          total_seconds: number | null
          user_id: string | null
        }
        Relationships: []
      }
      task_rollups: {
        Row: {
          entry_count: number | null
          estimate_seconds: number | null
          last_tracked_at: string | null
          parent_id: string | null
          project_id: string | null
          sort_order: number | null
          status: string | null
          task_id: string | null
          task_name: string | null
          total_seconds: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "task_rollups"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_rollups"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

// Convenience row aliases used across the app.
export type Client = PublicSchema["Tables"]["clients"]["Row"]
export type Project = PublicSchema["Tables"]["projects"]["Row"]
export type Task = PublicSchema["Tables"]["tasks"]["Row"]
export type TimeEntry = PublicSchema["Tables"]["time_entries"]["Row"]
export type InvoiceTemplate = PublicSchema["Tables"]["invoice_templates"]["Row"]
export type Invoice = PublicSchema["Tables"]["invoices"]["Row"]
export type InvoiceLineItem = PublicSchema["Tables"]["invoice_line_items"]["Row"]
export type ProjectRollup = PublicSchema["Views"]["project_rollups"]["Row"]
export type TaskRollup = PublicSchema["Views"]["task_rollups"]["Row"]
export type Subscription = PublicSchema["Tables"]["subscriptions"]["Row"]
