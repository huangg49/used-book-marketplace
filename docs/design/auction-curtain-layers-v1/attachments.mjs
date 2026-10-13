// Attachment points measured on the existing PNG gold hem at each ornament's x.
// Coordinates are in the parent's rendered 1920×1080 artwork, not image pixels.
const sockets = {
  'pendant-side-inner-left': ['valance-front',37.26],
  'pendant-side-inner-right': ['valance-front',37.80],
  'pendant-side-outer-left': ['valance-rear-left',104.88],
  'pendant-side-outer-right': ['valance-rear-right',104.88],
  'pendant-center': ['valance-front',138.25],
};
export function attachLayers(manifest) {
  const layers=manifest.layers.map(layer=>({...layer}));
  const byId=new Map(layers.map(layer=>[layer.id,layer]));
  for(const [id,[parent,edgeY]] of Object.entries(sockets)){
    const layer=byId.get(id),support=byId.get(parent);
    layer.attachment={parent,edgeY,overlap:2};
    layer.y=support.y+edgeY-2;layer.z=support.z+1;layer.pivot=[.5,0];
  }
  for(const side of ['left','right']){
    const rope=byId.get('rope-'+side),tassels=byId.get('tassels-'+side);
    // These generated rope sprites contain a disconnected fragment below the knot.
    // Clip that fragment in composition; preserve the source PNG unchanged.
    rope.clip='inset(0 0 46% 0)';
    const uv=[side==='left'?.30:.70,.505];
    rope.motionAnchor={parent:'outer-'+side,uv};
    tassels.motionAnchor={parent:'outer-'+side,uv};
    tassels.x=side==='left'?22:1834;tassels.y=544;tassels.pivot=[.5,0];
  }
  return {...manifest,layers};
}
