import { supabase, isSupabaseConfigured } from '../lib/supabase';
export type CatalogCategory = { id: number; name: string; icon: string; description: string; displayOrder: number };
export async function listActiveCategories(): Promise<CatalogCategory[]> {
  if (!isSupabaseConfigured) throw new Error('Category catalog is unavailable.');
  const {data,error}=await supabase.from('tbl_categories').select('id,name,icon,description,display_order').eq('is_enabled',true).is('archived_at',null).order('display_order').order('name');
  if(error) throw new Error(`Could not load categories: ${error.message}`);
  return (data??[]).map(row=>({id:Number(row.id),name:String(row.name).trim(),icon:String(row.icon||''),description:String(row.description||''),displayOrder:Number(row.display_order)})).filter(row=>!/^\[QA\]/i.test(row.name));
}
