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
      auth_group: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      auth_group_permissions: {
        Row: {
          group_id: number
          id: number
          permission_id: number
        }
        Insert: {
          group_id: number
          id?: number
          permission_id: number
        }
        Update: {
          group_id?: number
          id?: number
          permission_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "auth_group_permissio_permission_id_84c5c92e_fk_auth_perm"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "auth_permission"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auth_group_permissions_group_id_b120cbf9_fk_auth_group_id"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "auth_group"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_permission: {
        Row: {
          codename: string
          content_type_id: number
          id: number
          name: string
        }
        Insert: {
          codename: string
          content_type_id: number
          id?: number
          name: string
        }
        Update: {
          codename?: string
          content_type_id?: number
          id?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_permission_content_type_id_2f476e4b_fk_django_co"
            columns: ["content_type_id"]
            isOneToOne: false
            referencedRelation: "django_content_type"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_user: {
        Row: {
          date_joined: string
          email: string
          first_name: string
          id: number
          is_active: boolean
          is_staff: boolean
          is_superuser: boolean
          last_login: string | null
          last_name: string
          password: string
          username: string
        }
        Insert: {
          date_joined: string
          email: string
          first_name: string
          id?: number
          is_active: boolean
          is_staff: boolean
          is_superuser: boolean
          last_login?: string | null
          last_name: string
          password: string
          username: string
        }
        Update: {
          date_joined?: string
          email?: string
          first_name?: string
          id?: number
          is_active?: boolean
          is_staff?: boolean
          is_superuser?: boolean
          last_login?: string | null
          last_name?: string
          password?: string
          username?: string
        }
        Relationships: []
      }
      auth_user_groups: {
        Row: {
          group_id: number
          id: number
          user_id: number
        }
        Insert: {
          group_id: number
          id?: number
          user_id: number
        }
        Update: {
          group_id?: number
          id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "auth_user_groups_group_id_97559544_fk_auth_group_id"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "auth_group"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auth_user_groups_user_id_6a12ed8b_fk_auth_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth_user"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_user_user_permissions: {
        Row: {
          id: number
          permission_id: number
          user_id: number
        }
        Insert: {
          id?: number
          permission_id: number
          user_id: number
        }
        Update: {
          id?: number
          permission_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "auth_user_user_permi_permission_id_1fbb5f2c_fk_auth_perm"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "auth_permission"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auth_user_user_permissions_user_id_a95ead1b_fk_auth_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth_user"
            referencedColumns: ["id"]
          },
        ]
      }
      django_admin_log: {
        Row: {
          action_flag: number
          action_time: string
          change_message: string
          content_type_id: number | null
          id: number
          object_id: string | null
          object_repr: string
          user_id: number
        }
        Insert: {
          action_flag: number
          action_time: string
          change_message: string
          content_type_id?: number | null
          id?: number
          object_id?: string | null
          object_repr: string
          user_id: number
        }
        Update: {
          action_flag?: number
          action_time?: string
          change_message?: string
          content_type_id?: number | null
          id?: number
          object_id?: string | null
          object_repr?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "django_admin_log_content_type_id_c4bce8eb_fk_django_co"
            columns: ["content_type_id"]
            isOneToOne: false
            referencedRelation: "django_content_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "django_admin_log_user_id_c564eba6_fk_auth_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "auth_user"
            referencedColumns: ["id"]
          },
        ]
      }
      django_content_type: {
        Row: {
          app_label: string
          id: number
          model: string
        }
        Insert: {
          app_label: string
          id?: number
          model: string
        }
        Update: {
          app_label?: string
          id?: number
          model?: string
        }
        Relationships: []
      }
      django_migrations: {
        Row: {
          app: string
          applied: string
          id: number
          name: string
        }
        Insert: {
          app: string
          applied: string
          id?: number
          name: string
        }
        Update: {
          app?: string
          applied?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      django_session: {
        Row: {
          expire_date: string
          session_data: string
          session_key: string
        }
        Insert: {
          expire_date: string
          session_data: string
          session_key: string
        }
        Update: {
          expire_date?: string
          session_data?: string
          session_key?: string
        }
        Relationships: []
      }
      tbl_activity_vibes: {
        Row: {
          caption: string
          created_at: string | null
          event_id: number | null
          hashtags: string[]
          height: number | null
          id: number
          likes_count: number | null
          media_type: string
          media_url: string
          thumbnail_url: string | null
          updated_at: string
          user_id: number | null
          visibility: string
          width: number | null
        }
        Insert: {
          caption?: string
          created_at?: string | null
          event_id?: number | null
          hashtags?: string[]
          height?: number | null
          id?: number
          likes_count?: number | null
          media_type: string
          media_url: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: number | null
          visibility?: string
          width?: number | null
        }
        Update: {
          caption?: string
          created_at?: string | null
          event_id?: number | null
          hashtags?: string[]
          height?: number | null
          id?: number
          likes_count?: number | null
          media_type?: string
          media_url?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: number | null
          visibility?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tbl_activity_vibes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tbl_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_activity_vibes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_badges: {
        Row: {
          created_at: string
          description: string
          icon: string | null
          id: number
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string
          icon?: string | null
          id?: number
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string
          icon?: string | null
          id?: number
          name?: string
          slug?: string
        }
        Relationships: []
      }
      tbl_categories: {
        Row: {
          created_at: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      tbl_chat_participants: {
        Row: {
          id: number
          joined_at: string | null
          last_read_at: string | null
          muted: boolean
          role: string | null
          room_id: number | null
          user_id: number | null
        }
        Insert: {
          id?: number
          joined_at?: string | null
          last_read_at?: string | null
          muted?: boolean
          role?: string | null
          room_id?: number | null
          user_id?: number | null
        }
        Update: {
          id?: number
          joined_at?: string | null
          last_read_at?: string | null
          muted?: boolean
          role?: string | null
          room_id?: number | null
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tbl_chat_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "tbl_chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_chat_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_chat_poll_options: {
        Row: {
          id: number
          option_text: string
          poll_id: number
        }
        Insert: {
          id?: number
          option_text: string
          poll_id: number
        }
        Update: {
          id?: number
          option_text?: string
          poll_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_chat_poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "tbl_chat_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_chat_poll_votes: {
        Row: {
          created_at: string | null
          id: number
          option_id: number
          poll_id: number
          user_id: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          option_id: number
          poll_id: number
          user_id: number
        }
        Update: {
          created_at?: string | null
          id?: number
          option_id?: number
          poll_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_chat_poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "tbl_chat_poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_chat_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "tbl_chat_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_chat_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_chat_polls: {
        Row: {
          created_at: string | null
          created_by: number
          id: number
          question: string
          room_id: number
        }
        Insert: {
          created_at?: string | null
          created_by: number
          id?: number
          question: string
          room_id: number
        }
        Update: {
          created_at?: string | null
          created_by?: number
          id?: number
          question?: string
          room_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_chat_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_chat_polls_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "tbl_chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_chat_rooms: {
        Row: {
          category_id: number | null
          cover_url: string | null
          created_at: string | null
          created_by: number | null
          description: string | null
          event_id: number | null
          gender_preference: string | null
          id: number
          image_url: string | null
          join_type: string | null
          max_age: number | null
          min_age: number | null
          post_permission: string | null
          room_type: string
          rules: string[]
          tagline: string | null
          tags: string[]
          title: string | null
          updated_at: string | null
          verification_level: string | null
          visibility: string
        }
        Insert: {
          category_id?: number | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: number | null
          description?: string | null
          event_id?: number | null
          gender_preference?: string | null
          id?: number
          image_url?: string | null
          join_type?: string | null
          max_age?: number | null
          min_age?: number | null
          post_permission?: string | null
          room_type: string
          rules?: string[]
          tagline?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string | null
          verification_level?: string | null
          visibility?: string
        }
        Update: {
          category_id?: number | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: number | null
          description?: string | null
          event_id?: number | null
          gender_preference?: string | null
          id?: number
          image_url?: string | null
          join_type?: string | null
          max_age?: number | null
          min_age?: number | null
          post_permission?: string | null
          room_type?: string
          rules?: string[]
          tagline?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string | null
          verification_level?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "tbl_chat_rooms_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tbl_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_chat_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_chat_rooms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tbl_events"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_community_join_requests: {
        Row: {
          created_at: string | null
          id: number
          room_id: number
          status: string | null
          user_id: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          room_id: number
          status?: string | null
          user_id: number
        }
        Update: {
          created_at?: string | null
          id?: number
          room_id?: number
          status?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_community_join_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "tbl_chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_community_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_community_post_comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          id: number
          parent_id: number | null
          post_id: number
          updated_at: string
          user_id: number
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: number
          parent_id?: number | null
          post_id: number
          updated_at?: string
          user_id: number
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: number
          parent_id?: number | null
          post_id?: number
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_community_post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tbl_community_post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_community_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "tbl_community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_community_post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_community_post_reactions: {
        Row: {
          created_at: string
          id: number
          post_id: number
          reaction: string
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          post_id: number
          reaction?: string
          user_id: number
        }
        Update: {
          created_at?: string
          id?: number
          post_id?: number
          reaction?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_community_post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "tbl_community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_community_post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_community_posts: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          id: number
          media_type: string | null
          media_url: string | null
          room_id: number
          title: string | null
          updated_at: string
          user_id: number
        }
        Insert: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: number
          media_type?: string | null
          media_url?: string | null
          room_id: number
          title?: string | null
          updated_at?: string
          user_id: number
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: number
          media_type?: string | null
          media_url?: string | null
          room_id?: number
          title?: string | null
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_community_posts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "tbl_chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_emergency_contacts: {
        Row: {
          contact_name: string
          countrycode: string
          created_at: string
          id: number
          is_verified: boolean
          phone_number: string
          relation: string
          updated_at: string
          user_id: number
        }
        Insert: {
          contact_name: string
          countrycode?: string
          created_at?: string
          id?: number
          is_verified?: boolean
          phone_number: string
          relation: string
          updated_at?: string
          user_id: number
        }
        Update: {
          contact_name?: string
          countrycode?: string
          created_at?: string
          id?: number
          is_verified?: boolean
          phone_number?: string
          relation?: string
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_emergency_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_event_categories: {
        Row: {
          category_id: number
          created_at: string
          created_by: number | null
          event_id: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          category_id: number
          created_at?: string
          created_by?: number | null
          event_id: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          category_id?: number
          created_at?: string
          created_by?: number | null
          event_id?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tbl_event_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tbl_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_categories_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tbl_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_event_comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          event_id: number
          id: number
          parent_id: number | null
          updated_at: string
          user_id: number
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          event_id: number
          id?: number
          parent_id?: number | null
          updated_at?: string
          user_id: number
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          event_id?: number
          id?: number
          parent_id?: number | null
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_event_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tbl_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tbl_event_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_event_feedback: {
        Row: {
          comment: string | null
          created_at: string
          created_by: number
          event_id: number
          id: number
          reaction: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by: number
          event_id: number
          id?: number
          reaction: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: number
          event_id?: number
          id?: number
          reaction?: string
        }
        Relationships: [
          {
            foreignKeyName: "tbl_event_reactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tbl_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_reactions_user_id_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_event_likes: {
        Row: {
          created_at: string
          event_id: number
          id: number
          user_id: number
        }
        Insert: {
          created_at?: string
          event_id: number
          id?: number
          user_id: number
        }
        Update: {
          created_at?: string
          event_id?: number
          id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_event_likes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tbl_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_event_participants: {
        Row: {
          created_at: string
          event_id: number
          id: number
          invited_by: number | null
          joined_at: string | null
          responded_at: string | null
          status: string
          user_id: number
        }
        Insert: {
          created_at?: string
          event_id: number
          id?: number
          invited_by?: number | null
          joined_at?: string | null
          responded_at?: string | null
          status: string
          user_id: number
        }
        Update: {
          created_at?: string
          event_id?: number
          id?: number
          invited_by?: number | null
          joined_at?: string | null
          responded_at?: string | null
          status?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tbl_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_participants_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_event_reports: {
        Row: {
          created_at: string | null
          description: string | null
          event_id: number
          id: number
          reason: string
          reporter_id: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_id: number
          id?: number
          reason: string
          reporter_id: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_id?: number
          id?: number
          reason?: string
          reporter_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_event_reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tbl_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_event_saves: {
        Row: {
          created_at: string
          event_id: number
          id: number
          user_id: number
        }
        Insert: {
          created_at?: string
          event_id: number
          id?: number
          user_id: number
        }
        Update: {
          created_at?: string
          event_id?: number
          id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_event_saves_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tbl_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_events: {
        Row: {
          age_max: number | null
          age_min: number | null
          created_at: string | null
          created_by: number
          currency: string
          description: string | null
          display_location: string | null
          event_end_time: string | null
          event_start_time: string | null
          gender_preference: string | null
          id: number
          intent: string | null
          is_cancelled: boolean | null
          is_deleted: boolean | null
          is_paid: boolean
          join_type: string
          latitude: number | null
          location: string | null
          location_instruction: string | null
          longitude: number | null
          max_participants: number | null
          media: Json | null
          price: number
          registration_close_time: string | null
          status: string
          title: string
          updated_at: string | null
          updated_by: number | null
          verified_only: boolean | null
          visibility_type: string
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          created_at?: string | null
          created_by: number
          currency?: string
          description?: string | null
          display_location?: string | null
          event_end_time?: string | null
          event_start_time?: string | null
          gender_preference?: string | null
          id?: number
          intent?: string | null
          is_cancelled?: boolean | null
          is_deleted?: boolean | null
          is_paid?: boolean
          join_type: string
          latitude?: number | null
          location?: string | null
          location_instruction?: string | null
          longitude?: number | null
          max_participants?: number | null
          media?: Json | null
          price?: number
          registration_close_time?: string | null
          status?: string
          title: string
          updated_at?: string | null
          updated_by?: number | null
          verified_only?: boolean | null
          visibility_type: string
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          created_at?: string | null
          created_by?: number
          currency?: string
          description?: string | null
          display_location?: string | null
          event_end_time?: string | null
          event_start_time?: string | null
          gender_preference?: string | null
          id?: number
          intent?: string | null
          is_cancelled?: boolean | null
          is_deleted?: boolean | null
          is_paid?: boolean
          join_type?: string
          latitude?: number | null
          location?: string | null
          location_instruction?: string | null
          longitude?: number | null
          max_participants?: number | null
          media?: Json | null
          price?: number
          registration_close_time?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          updated_by?: number | null
          verified_only?: boolean | null
          visibility_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tbl_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_events_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_friends: {
        Row: {
          created_at: string
          friend_id: number
          id: number
          user_id: number
        }
        Insert: {
          created_at?: string
          friend_id: number
          id?: number
          user_id: number
        }
        Update: {
          created_at?: string
          friend_id?: number
          id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_friends_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_friends_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_hubble_transactions: {
        Row: {
          coins: number
          created_at: string
          id: number
          note: string | null
          reference_id: string
          status: string
          transaction_type: string
          user_id: number
        }
        Insert: {
          coins: number
          created_at?: string
          id?: number
          note?: string | null
          reference_id: string
          status: string
          transaction_type: string
          user_id: number
        }
        Update: {
          coins?: number
          created_at?: string
          id?: number
          note?: string | null
          reference_id?: string
          status?: string
          transaction_type?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_hubble_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_messages: {
        Row: {
          client_id: string | null
          content: string
          created_at: string | null
          deleted_at: string | null
          edited_at: string | null
          id: number
          is_delivered: boolean
          is_read: boolean | null
          media_url: string | null
          message_type: string | null
          reply_to_id: number | null
          room_id: number | null
          sender_id: number | null
          thumbnail_url: string | null
        }
        Insert: {
          client_id?: string | null
          content: string
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          id?: number
          is_delivered?: boolean
          is_read?: boolean | null
          media_url?: string | null
          message_type?: string | null
          reply_to_id?: number | null
          room_id?: number | null
          sender_id?: number | null
          thumbnail_url?: string | null
        }
        Update: {
          client_id?: string | null
          content?: string
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          id?: number
          is_delivered?: boolean
          is_read?: boolean | null
          media_url?: string | null
          message_type?: string | null
          reply_to_id?: number | null
          room_id?: number | null
          sender_id?: number | null
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tbl_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "tbl_chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          id: number
          is_read: boolean | null
          read_at: string | null
          reference_id: string
          sender_id: number | null
          title: string
          type: string
          user_id: number
        }
        Insert: {
          body?: string
          created_at?: string
          data?: Json
          id?: number
          is_read?: boolean | null
          read_at?: string | null
          reference_id: string
          sender_id?: number | null
          title?: string
          type: string
          user_id: number
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          id?: number
          is_read?: boolean | null
          read_at?: string | null
          reference_id?: string
          sender_id?: number | null
          title?: string
          type?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_participant_rating_scores: {
        Row: {
          id: number
          parameter_id: number | null
          rating_id: number | null
          score: number | null
        }
        Insert: {
          id?: number
          parameter_id?: number | null
          rating_id?: number | null
          score?: number | null
        }
        Update: {
          id?: number
          parameter_id?: number | null
          rating_id?: number | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tbl_event_rating_scores_parameter_id_fkey"
            columns: ["parameter_id"]
            isOneToOne: false
            referencedRelation: "tbl_rating_parameters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_rating_scores_rating_id_fkey"
            columns: ["rating_id"]
            isOneToOne: false
            referencedRelation: "tbl_participant_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_participant_ratings: {
        Row: {
          comment: string | null
          created_at: string | null
          event_id: number | null
          id: number
          is_no_show: boolean | null
          overall_rating: number | null
          rated_user_id: number | null
          rater_id: number | null
          updated_at: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          event_id?: number | null
          id?: number
          is_no_show?: boolean | null
          overall_rating?: number | null
          rated_user_id?: number | null
          rater_id?: number | null
          updated_at?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          event_id?: number | null
          id?: number
          is_no_show?: boolean | null
          overall_rating?: number | null
          rated_user_id?: number | null
          rater_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tbl_event_ratings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tbl_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_ratings_rated_user_id_fkey"
            columns: ["rated_user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_event_ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_phone_otps: {
        Row: {
          created_at: string
          id: number
          otp_code: string
          phone_number: string
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          otp_code: string
          phone_number: string
          user_id: number
        }
        Update: {
          created_at?: string
          id?: number
          otp_code?: string
          phone_number?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_phone_otps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_rating_parameters: {
        Row: {
          created_at: string | null
          id: number
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      tbl_rating_scores: {
        Row: {
          id: number
          parameter_id: number | null
          rating_id: number | null
          score: number | null
        }
        Insert: {
          id?: number
          parameter_id?: number | null
          rating_id?: number | null
          score?: number | null
        }
        Update: {
          id?: number
          parameter_id?: number | null
          rating_id?: number | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tbl_rating_scores_parameter_id_fkey"
            columns: ["parameter_id"]
            isOneToOne: false
            referencedRelation: "tbl_rating_parameters"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_referral_history: {
        Row: {
          created_at: string | null
          id: number
          points_awarded: number | null
          referred_user_id: number
          referrer_id: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          points_awarded?: number | null
          referred_user_id: number
          referrer_id: number
        }
        Update: {
          created_at?: string | null
          id?: number
          points_awarded?: number | null
          referred_user_id?: number
          referrer_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_referral_history_referred_user_id_fkey"
            columns: ["referred_user_id"]
            isOneToOne: true
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_referral_history_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_stories: {
        Row: {
          caption: string
          created_at: string
          deleted_at: string | null
          expires_at: string
          id: number
          media_type: string
          media_url: string
          user_id: number
        }
        Insert: {
          caption?: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string
          id?: number
          media_type: string
          media_url: string
          user_id: number
        }
        Update: {
          caption?: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string
          id?: number
          media_type?: string
          media_url?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_story_views: {
        Row: {
          story_id: number
          viewed_at: string
          viewer_id: number
        }
        Insert: {
          story_id: number
          viewed_at?: string
          viewer_id: number
        }
        Update: {
          story_id?: number
          viewed_at?: string
          viewer_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "tbl_stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_story_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_user_badges: {
        Row: {
          awarded_at: string
          awarded_by: number | null
          badge_id: number
          user_id: number
        }
        Insert: {
          awarded_at?: string
          awarded_by?: number | null
          badge_id: number
          user_id: number
        }
        Update: {
          awarded_at?: string
          awarded_by?: number | null
          badge_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_user_badges_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "tbl_badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_user_feedbacks: {
        Row: {
          created_at: string
          id: number
          message: string
          rating: number | null
          type: string
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          message: string
          rating?: number | null
          type: string
          user_id: number
        }
        Update: {
          created_at?: string
          id?: number
          message?: string
          rating?: number | null
          type?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_user_feedbacks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_user_interests: {
        Row: {
          category_id: number
          created_at: string
          id: number
          user_id: number
        }
        Insert: {
          category_id: number
          created_at?: string
          id?: number
          user_id: number
        }
        Update: {
          category_id?: number
          created_at?: string
          id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_user_interests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tbl_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_user_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_user_points_history: {
        Row: {
          created_at: string
          id: number
          points_earned: number | null
          rating_id: number
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          points_earned?: number | null
          rating_id: number
          user_id: number
        }
        Update: {
          created_at?: string
          id?: number
          points_earned?: number | null
          rating_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_user_points_history_rating_id_fkey"
            columns: ["rating_id"]
            isOneToOne: false
            referencedRelation: "tbl_participant_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_user_points_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_user_privacy_settings: {
        Row: {
          email_visibility: string | null
          id: number
          message_visibility: string | null
          phone_visibility: string | null
          profile_visibility: string | null
          show_online_status: boolean | null
          updated_at: string | null
          user_id: number
        }
        Insert: {
          email_visibility?: string | null
          id?: number
          message_visibility?: string | null
          phone_visibility?: string | null
          profile_visibility?: string | null
          show_online_status?: boolean | null
          updated_at?: string | null
          user_id: number
        }
        Update: {
          email_visibility?: string | null
          id?: number
          message_visibility?: string | null
          phone_visibility?: string | null
          profile_visibility?: string | null
          show_online_status?: boolean | null
          updated_at?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_user_privacy_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_user_profile_images: {
        Row: {
          created_at: string | null
          id: number
          image_url: string
          slot_index: number
          user_id: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          image_url: string
          slot_index: number
          user_id: number
        }
        Update: {
          created_at?: string | null
          id?: number
          image_url?: string
          slot_index?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_user_profile_images_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_user_reports: {
        Row: {
          created_at: string
          description: string | null
          id: number
          reason: string
          reporter_id: number
          target_user_id: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          reason: string
          reporter_id: number
          target_user_id: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          reason?: string
          reporter_id?: number
          target_user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_user_reports_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_user_social_links: {
        Row: {
          created_at: string | null
          facebook: string | null
          id: number
          instagram: string | null
          linkedin: string | null
          twitter: string | null
          updated_at: string | null
          user_id: number
          youtube: string | null
        }
        Insert: {
          created_at?: string | null
          facebook?: string | null
          id?: number
          instagram?: string | null
          linkedin?: string | null
          twitter?: string | null
          updated_at?: string | null
          user_id: number
          youtube?: string | null
        }
        Update: {
          created_at?: string | null
          facebook?: string | null
          id?: number
          instagram?: string | null
          linkedin?: string | null
          twitter?: string | null
          updated_at?: string | null
          user_id?: number
          youtube?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tbl_user_social_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_user_verification: {
        Row: {
          aadhaar_client_id: string | null
          aadhaar_number: string | null
          aadhaar_otp_code: string | null
          aadhaar_otp_created_at: string | null
          aadhaar_verified: boolean
          created_at: string
          document_mime: string | null
          document_path: string | null
          document_size: number | null
          id: number
          phone_verified: boolean
          review_notes: string
          reviewed_at: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: number
          verification_type: string
        }
        Insert: {
          aadhaar_client_id?: string | null
          aadhaar_number?: string | null
          aadhaar_otp_code?: string | null
          aadhaar_otp_created_at?: string | null
          aadhaar_verified?: boolean
          created_at?: string
          document_mime?: string | null
          document_path?: string | null
          document_size?: number | null
          id?: number
          phone_verified?: boolean
          review_notes?: string
          reviewed_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: number
          verification_type?: string
        }
        Update: {
          aadhaar_client_id?: string | null
          aadhaar_number?: string | null
          aadhaar_otp_code?: string | null
          aadhaar_otp_created_at?: string | null
          aadhaar_verified?: boolean
          created_at?: string
          document_mime?: string | null
          document_path?: string | null
          document_size?: number | null
          id?: number
          phone_verified?: boolean
          review_notes?: string
          reviewed_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: number
          verification_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tbl_user_verification_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_users: {
        Row: {
          about: string | null
          auth_user_id: string | null
          bio: string | null
          countrycode: string | null
          create_at: string | null
          dob: string | null
          email: string
          fcm_token: string | null
          fullname: string
          gender: string | null
          id: number
          is_active: number | null
          is_delete: number | null
          isverified: number | null
          nationality: string | null
          occupation: string | null
          password: string
          phonenumber: number | null
          points: number | null
          profile_image: string | null
          rating: number | null
          username: string
        }
        Insert: {
          about?: string | null
          auth_user_id?: string | null
          bio?: string | null
          countrycode?: string | null
          create_at?: string | null
          dob?: string | null
          email: string
          fcm_token?: string | null
          fullname: string
          gender?: string | null
          id?: number
          is_active?: number | null
          is_delete?: number | null
          isverified?: number | null
          nationality?: string | null
          occupation?: string | null
          password: string
          phonenumber?: number | null
          points?: number | null
          profile_image?: string | null
          rating?: number | null
          username: string
        }
        Update: {
          about?: string | null
          auth_user_id?: string | null
          bio?: string | null
          countrycode?: string | null
          create_at?: string | null
          dob?: string | null
          email?: string
          fcm_token?: string | null
          fullname?: string
          gender?: string | null
          id?: number
          is_active?: number | null
          is_delete?: number | null
          isverified?: number | null
          nationality?: string | null
          occupation?: string | null
          password?: string
          phonenumber?: number | null
          points?: number | null
          profile_image?: string | null
          rating?: number | null
          username?: string
        }
        Relationships: []
      }
      tbl_vibe_comments: {
        Row: {
          created_at: string | null
          id: number
          parent_id: number | null
          text: string
          updated_at: string
          user_id: number
          vibe_id: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          parent_id?: number | null
          text: string
          updated_at?: string
          user_id: number
          vibe_id: number
        }
        Update: {
          created_at?: string | null
          id?: number
          parent_id?: number | null
          text?: string
          updated_at?: string
          user_id?: number
          vibe_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_vibe_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tbl_vibe_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_vibe_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_vibe_comments_vibe_id_fkey"
            columns: ["vibe_id"]
            isOneToOne: false
            referencedRelation: "tbl_activity_vibes"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_vibe_likes: {
        Row: {
          created_at: string | null
          id: number
          user_id: number
          vibe_id: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          user_id: number
          vibe_id: number
        }
        Update: {
          created_at?: string | null
          id?: number
          user_id?: number
          vibe_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_vibe_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_vibe_likes_vibe_id_fkey"
            columns: ["vibe_id"]
            isOneToOne: false
            referencedRelation: "tbl_activity_vibes"
            referencedColumns: ["id"]
          },
        ]
      }
      tbl_vibe_shares: {
        Row: {
          channel: string
          created_at: string
          id: number
          user_id: number
          vibe_id: number
        }
        Insert: {
          channel: string
          created_at?: string
          id?: number
          user_id: number
          vibe_id: number
        }
        Update: {
          channel?: string
          created_at?: string
          id?: number
          user_id?: number
          vibe_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tbl_vibe_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "tbl_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tbl_vibe_shares_vibe_id_fkey"
            columns: ["vibe_id"]
            isOneToOne: false
            referencedRelation: "tbl_activity_vibes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_verifications: {
        Args: { p_before_id?: number; p_limit?: number; p_status?: string }
        Returns: Json[]
      }
      admin_review_verification: {
        Args: {
          p_review_notes?: string
          p_status: string
          p_verification_id: number
        }
        Returns: Json
      }
      assert_chat_membership: { Args: { p_room_id: number }; Returns: boolean }
      can_read_event: { Args: { p_event_id: number }; Returns: boolean }
      cancel_activity: { Args: { p_event_id: number }; Returns: undefined }
      community_create: {
        Args: {
          p_category: string
          p_cover_path: string
          p_description: string
          p_image_path: string
          p_name: string
          p_rules: string[]
          p_tagline: string
          p_tags: string[]
          p_visibility: string
        }
        Returns: number
      }
      community_create_post: {
        Args: {
          p_body: string
          p_category: string
          p_media_path?: string
          p_media_type?: string
          p_room_id: number
          p_title: string
        }
        Returns: Json
      }
      community_create_post_comment: {
        Args: { p_body: string; p_parent_id?: number; p_post_id: number }
        Returns: Json
      }
      community_join: { Args: { p_room_id: number }; Returns: Json }
      community_leave: { Args: { p_room_id: number }; Returns: undefined }
      community_list_post_comments: {
        Args: { p_page?: number; p_page_size?: number; p_post_id: number }
        Returns: Json
      }
      community_set_post_reaction: {
        Args: { p_post_id: number; p_reaction?: string }
        Returns: undefined
      }
      create_activity: {
        Args: { p_payload: Json; p_status?: string }
        Returns: number
      }
      create_activity_comment: {
        Args: { p_body: string; p_event_id: number; p_parent_id?: number }
        Returns: Json
      }
      create_direct_chat_room: {
        Args: { p_other_user_id: number }
        Returns: number
      }
      create_group_chat_room: {
        Args: { p_member_ids: number[]; p_title: string }
        Returns: number
      }
      create_story: {
        Args: {
          p_caption?: string
          p_expires_at?: string
          p_media_type: string
          p_media_url: string
        }
        Returns: Json
      }
      create_verification_draft: {
        Args: { p_verification_type?: string }
        Returns: {
          aadhaar_client_id: string | null
          aadhaar_number: string | null
          aadhaar_otp_code: string | null
          aadhaar_otp_created_at: string | null
          aadhaar_verified: boolean
          created_at: string
          document_mime: string | null
          document_path: string | null
          document_size: number | null
          id: number
          phone_verified: boolean
          review_notes: string
          reviewed_at: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: number
          verification_type: string
        }
        SetofOptions: {
          from: "*"
          to: "tbl_user_verification"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_app_user_id: { Args: never; Returns: number }
      delete_activity_comment: { Args: { p_comment_id: number }; Returns: Json }
      delete_story: { Args: { p_story_id: number }; Returns: Json }
      discard_verification_draft: {
        Args: { p_verification_id: number }
        Returns: undefined
      }
      finalize_verification: {
        Args: {
          p_document_mime: string
          p_document_path: string
          p_document_size: number
          p_verification_id: number
        }
        Returns: {
          aadhaar_client_id: string | null
          aadhaar_number: string | null
          aadhaar_otp_code: string | null
          aadhaar_otp_created_at: string | null
          aadhaar_verified: boolean
          created_at: string
          document_mime: string | null
          document_path: string | null
          document_size: number | null
          id: number
          phone_verified: boolean
          review_notes: string
          reviewed_at: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: number
          verification_type: string
        }
        SetofOptions: {
          from: "*"
          to: "tbl_user_verification"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_current_app_user_id: { Args: never; Returns: number }
      get_current_legacy_user_id: { Args: never; Returns: number }
      get_my_profile: { Args: never; Returns: Json }
      get_user_privacy_settings: {
        Args: never
        Returns: {
          email_visibility: string | null
          id: number
          message_visibility: string | null
          phone_visibility: string | null
          profile_visibility: string | null
          show_online_status: boolean | null
          updated_at: string | null
          user_id: number
        }
        SetofOptions: {
          from: "*"
          to: "tbl_user_privacy_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_chat_member: { Args: { p_room_id: number }; Returns: boolean }
      is_event_participant: { Args: { p_event_id: number }; Returns: boolean }
      is_wenitro_admin: { Args: never; Returns: boolean }
      list_active_stories: {
        Args: {
          p_before_created_at?: string
          p_before_id?: number
          p_limit?: number
        }
        Returns: Json[]
      }
      list_activity_comments: {
        Args: { p_event_id: number; p_page?: number; p_page_size?: number }
        Returns: Json
      }
      list_badge_catalog: { Args: never; Returns: Json[] }
      list_chat_messages: {
        Args: {
          p_before_created_at?: string
          p_before_id?: number
          p_include_deleted?: boolean
          p_limit?: number
          p_room_id: number
        }
        Returns: Json[]
      }
      list_chat_participants: { Args: { p_room_id: number }; Returns: Json[] }
      list_interest_catalog: { Args: never; Returns: Json[] }
      list_my_badges: { Args: never; Returns: Json[] }
      list_my_interests: { Args: never; Returns: Json[] }
      list_my_stories: {
        Args: { p_include_expired?: boolean }
        Returns: Json[]
      }
      list_user_notifications: {
        Args: { p_before_id?: number; p_limit?: number }
        Returns: {
          body: string
          created_at: string
          data: Json
          id: number
          is_read: boolean | null
          read_at: string | null
          reference_id: string
          sender_id: number | null
          title: string
          type: string
          user_id: number
        }[]
        SetofOptions: {
          from: "*"
          to: "tbl_notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_user_verifications: {
        Args: never
        Returns: {
          aadhaar_client_id: string | null
          aadhaar_number: string | null
          aadhaar_otp_code: string | null
          aadhaar_otp_created_at: string | null
          aadhaar_verified: boolean
          created_at: string
          document_mime: string | null
          document_path: string | null
          document_size: number | null
          id: number
          phone_verified: boolean
          review_notes: string
          reviewed_at: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: number
          verification_type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tbl_user_verification"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_chat_read: {
        Args: { p_read_at?: string; p_room_id: number }
        Returns: Json
      }
      mark_notification_read: {
        Args: { p_notification_id: number }
        Returns: undefined
      }
      mark_story_viewed: { Args: { p_story_id: number }; Returns: Json }
      request_join_activity: {
        Args: { p_event_id: number; p_status?: string }
        Returns: {
          created_at: string
          event_id: number
          id: number
          invited_by: number | null
          joined_at: string | null
          responded_at: string | null
          status: string
          user_id: number
        }
        SetofOptions: {
          from: "*"
          to: "tbl_event_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_activity_join: {
        Args: { p_event_id: number; p_status: string; p_user_id: number }
        Returns: {
          created_at: string
          event_id: number
          id: number
          invited_by: number | null
          joined_at: string | null
          responded_at: string | null
          status: string
          user_id: number
        }
        SetofOptions: {
          from: "*"
          to: "tbl_event_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_chat_message: {
        Args: {
          p_client_id: string
          p_content: string
          p_media_url?: string
          p_message_type?: string
          p_room_id: number
        }
        Returns: Json
      }
      set_my_interests: { Args: { p_category_ids: number[] }; Returns: Json }
      update_activity: {
        Args: { p_event_id: number; p_patch: Json }
        Returns: number
      }
      update_my_profile: { Args: { p_patch: Json }; Returns: Json }
      update_user_privacy_settings: {
        Args: {
          p_email_visibility?: string
          p_message_visibility?: string
          p_phone_visibility?: string
          p_profile_visibility?: string
          p_show_online_status?: boolean
        }
        Returns: {
          email_visibility: string | null
          id: number
          message_visibility: string | null
          phone_visibility: string | null
          profile_visibility: string | null
          show_online_status: boolean | null
          updated_at: string | null
          user_id: number
        }
        SetofOptions: {
          from: "*"
          to: "tbl_user_privacy_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vibe_create: {
        Args: {
          p_caption: string
          p_event_id: number
          p_hashtags: string[]
          p_media_path: string
          p_media_type: string
          p_visibility: string
        }
        Returns: Json
      }
      vibe_create_comment: {
        Args: { p_body: string; p_parent_id?: number; p_vibe_id: number }
        Returns: Json
      }
      vibe_delete: { Args: { p_vibe_id: number }; Returns: Json }
      vibe_delete_comment: {
        Args: { p_comment_id: number }
        Returns: undefined
      }
      vibe_set_liked: {
        Args: { p_liked: boolean; p_vibe_id: number }
        Returns: undefined
      }
      vibe_track_share: {
        Args: { p_channel: string; p_vibe_id: number }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
