import { Slot, router, usePathname } from "expo-router";
import TopTabs, {
  type MaterialTopTabBarProps,
} from "expo-router/js-top-tabs";
import { View } from "react-native";

import { MAIN_TABS, TabBar } from "@/components/navigation/tab-bar";
import { hasPager } from "@/lib/native";
import { colors } from "@/theme";

export const unstable_settings = { initialRouteName: "camera" };

/*
 * Markets ← Camera → Feed, Snapchat style: a pager (react-native-tab-view over
 * react-native-pager-view) opening on the camera, with the shared bottom tab bar kept in
 * sync. Builds without the pager get the same pages without swiping.
 */
export default function MainLayout() {
  if (!hasPager()) return <NoSwipeShell />;
  return (
    <TopTabs
      tabBarPosition="bottom"
      tabBar={({ state, navigation }: MaterialTopTabBarProps) => (
        <TabBar
          index={state.index}
          onSelect={(i) => navigation.navigate(state.routes[i].name)}
        />
      )}
      screenOptions={{ sceneStyle: { backgroundColor: colors.bg } }}
    >
      {MAIN_TABS.map(({ name }) => (
        <TopTabs.Screen key={name} name={name} />
      ))}
    </TopTabs>
  );
}

function NoSwipeShell() {
  const path = usePathname();
  const index = Math.max(
    0,
    MAIN_TABS.findIndex(({ name }) => path === `/${name}`),
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <TabBar
        index={index}
        onSelect={(i) => router.replace(`/${MAIN_TABS[i].name}`)}
      />
    </View>
  );
}
