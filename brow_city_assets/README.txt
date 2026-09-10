BROW CITY PROCEDURAL ASSET PACK

Units: meters. Y-up. Front: -Z. Right: +X.
Origins: ground/base center, except weapons which use the grip pivot.

Four-wheel vehicles:
Vehicle_Body -> Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR.
Wheel pivots spin around local X and steer around local Y.
Left is -X; front is -Z.

Motorcycle: Wheel_Front / Wheel_Rear.
Speedboat: Outboard_L / Outboard_R, each with a Propeller group.

Vehicle paint: replace or recolor the VehiclePaint material.
Paint geometry has neutral white vertex colors.

Parking barrier:
Barrier_Base -> Barrier_Arm. Exported closed.
Open with arm.rotation.z = THREE.MathUtils.degToRad(85).

Characters use rigid transform groups, not a skinned skeleton.
Root children: Torso, Head, Arm_L, Arm_R, Leg_L, Leg_R.
Shoulder and hip pivots are ready for procedural animation.

Weapons are cosmetic game props; barrels point -Z.

Subway is a cutaway module with a raised street rim.
Lowest foundation is Y=0. Place its raised rim at your street level
if integrating it into a terrain opening.

Textures are procedural canvas labels embedded in each GLB.
No preview scene objects are included.
Triangle budget: 400-1200 per exported asset.
Simple assets use silhouette-preserving centroid subdivision.