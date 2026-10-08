import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  Model,
} from "react-native-filament";

import { colors } from "@/theme";

/*
 * Dev spike: the test glasses GLB in real 3D (Filament), turning slowly on a coloured
 * background. Open /dev/model3d. Proves the library builds and renders before it is
 * layered over the camera.
 */
export default function DevModel3d() {
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAngle((a) => a + 0.04), 33);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: "#2b6cb0" }}>
      <FilamentScene>
        <FilamentView style={{ flex: 1 }}>
          <Camera />
          <DefaultLight />
          <Model
            source={require("../../../assets/filters/models/neon-goggles.glb")}
            transformToUnitCube
            rotate={[0, angle, 0]}
          />
        </FilamentView>
      </FilamentScene>
      <Text
        style={{
          position: "absolute",
          top: 60,
          alignSelf: "center",
          color: colors.text,
        }}
      >
        Filament glasses test
      </Text>
    </View>
  );
}
