import bpy, math, os
from mathutils import Vector
OUT=r'C:\Users\rudra\Desktop\BrowOS\assets\models\gta\vehicles\koenigsegg.glb'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(n,c,metal=0.0):
 m=bpy.data.materials.new(n); m.diffuse_color=(*c,1); m.metallic=metal; m.roughness=.28; return m
white=mat('Pearl White',(0.8,.82,.84),.75); carbon=mat('Carbon Fiber',(.015,.02,.025),.8); red=mat('Red Calipers',(.65,.015,.01),.35); glass=mat('Visor',(.015,.06,.09),.5); tire=mat('Tire',(.008,.008,.008)); alloy=mat('Wheel Carbon',(.025,.03,.035),.8)
def cube(n,loc,scale,ma,bev=.1):
 bpy.ops.mesh.primitive_cube_add(location=loc); o=bpy.context.object; o.name=n; o.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bev: mod=o.modifiers.new('Edge softening','BEVEL'); mod.width=bev; mod.segments=2
 o.data.materials.append(ma); return o
def cyl(n,loc,r,d,ma,rot=(math.pi/2,0,0),verts=16):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d,location=loc,rotation=rot); o=bpy.context.object; o.name=n; o.data.materials.append(ma); return o
cube('Body',(0,1.0,0),(1.05,.38,2.25),white,.3); cube('Carbon_Stripe',(0,1.42,0),(.25,.025,2.0),carbon,.03); cube('Red_Pinstripe',(.29,1.45,0),(.035,.02,2.0),red,.01); cube('Red_Pinstripe',(-.29,1.45,0),(.035,.02,2.0),red,.01)
cube('Cockpit',(0,1.55,.05),(.72,.28,.85),glass,.25); cube('Roof_Scoop',(0,1.92,.55),(.22,.16,.5),carbon,.08)
cube('Front_Splitter',(0,.48,-2.38),(1.25,.06,.3),carbon,.03)
for x in (-.85,.85): cube('Side_Intake', (x,1.02,.25),(.12,.22,.65),carbon,.08); cube('Canard',(x*1.05,.65,-2.2),(.3,.04,.12),carbon,.02)
cube('Rear_Wing',(0,2.0,2.1),(1.35,.07,.18),carbon,.04)
for x in (-.85,.85): cube('Wing_Fin',(x,1.65,2.08),(.06,.4,.08),carbon,.02)
for x,z,n in [(-1.02,-1.35,'Wheel_FL'),(1.02,-1.35,'Wheel_FR'),(-1.02,1.35,'Wheel_RL'),(1.02,1.35,'Wheel_RR')]:
 cyl(n,(x,.55,z),.48,.28,tire); cyl(n+'_Rim',(x,.55,z),.31,.3,alloy)
 for a in range(5):
  ang=a*2*math.pi/5; spoke=cube(n+'_Spoke',(x+(.18*math.cos(ang)),.55+(.18*math.sin(ang)),z),(.035,.16,.035),alloy,.01); spoke.rotation_euler[2]=ang
 cyl(n+'_Caliper',(x+(-.28 if x<0 else .28),.55,z),.12,.32,red)
os.makedirs(os.path.dirname(OUT),exist_ok=True); bpy.ops.wm.save_as_mainfile(filepath=OUT+'.blend'); bpy.ops.export_scene.gltf(filepath=OUT,export_format='GLB',export_yup=True,export_apply=True)
