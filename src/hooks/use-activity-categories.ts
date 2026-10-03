import {useEffect,useState} from 'react';
import {listActiveCategories} from '../services/category-catalog';
export function useActivityCategories() {
  const [names,setNames]=useState<string[]>([]),[error,setError]=useState('');
  useEffect(()=>{let active=true;void listActiveCategories().then(rows=>{if(active){setNames(rows.map(row=>row.name));setError('');}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Categories could not be loaded.');});return()=>{active=false;};},[]);
  return {names,error};
}
