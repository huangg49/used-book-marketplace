import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BundleManifest } from '../components/BookBundle';
import { bundleCondition, bundleError, listingTitle, type BookBundle } from './book-bundle';
const bundle: BookBundle = {title:'Naruto tập 1–2',wholeOnly:true,exclusiveOwnershipDeclared:true,
  items:[{label:'Tập 1',condition:'Good',notes:''},{label:'Tập 2',condition:'Fair',notes:'Bìa sờn'}]};
describe('whole bundle presentation',()=>{
  it('shows every item and its defect, whole-lot policy and count',()=>{
    const html=renderToStaticMarkup(<BundleManifest bundle={bundle}/>);
    for(const text of ['Tập 1','Tập 2','Bìa sờn','Bộ 2 cuốn','Bán nguyên bộ'])expect(html).toContain(text);
  });
  it('keeps a single book unchanged',()=>{
    expect(renderToStaticMarkup(<BundleManifest/>)).toBe('');
    expect(listingTitle({book:{title:'Sách lẻ'}})).toBe('Sách lẻ');
  });
  it('uses the bundle title and worst condition',()=>{
    expect(listingTitle({book:{title:'Đầu sách đại diện'},bundle})).toBe(bundle.title);
    expect(bundleCondition(bundle)).toBe('Fair');
    expect(bundleError(bundle)).toBeUndefined();
  });
  it('rejects duplicate or incomplete manifests before submission',()=>{
    expect(bundleError({...bundle,items:[bundle.items[0],{...bundle.items[1],label:' TẬP 1 '}]})).toBeTruthy();
    expect(bundleError({...bundle,title:' '})).toBeTruthy();
    expect(bundleError({...bundle,items:[bundle.items[0]]})).toBeTruthy();
  });
});
