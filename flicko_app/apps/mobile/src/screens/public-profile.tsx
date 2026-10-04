import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderBar, IconButton } from "@/components/profile/header-bar";
import {
  ButtonRow,
  Identity,
  ProfileButton,
} from "@/components/profile/identity";
import {
  CreatorStrip,
  MemeGrid,
  PublicHoldingsList,
  Tabs,
} from "@/components/profile/lists";
import { MoreIcon, SendIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { ConnectFlow } from "@/components/wallet/connect-flow";
import { config } from "@/config";
import {
  useFollow,
  useProfile,
  usePublicHoldings,
  useUserMemes,
} from "@/features/profile/api";
import { ApiError } from "@/lib/api";
import { clipboard } from "@/lib/native";
import { hasSeekerGenesisToken } from "@/lib/seeker";
import { useSession } from "@/store/session";
import { colors, profile as p, type } from "@/theme";
import { IdentityBones } from "@/screens/me";

const TABS = [
  { id: "memes", label: "Memes" },
  { id: "holdings", label: "Holdings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/*
 * A creator's public profile (/u/<handle or wallet>): identity, Follow (accent) and
 * Share, a stats strip that says whether the creator is worth following, then Memes and
 * Holdings. No balances are ever shown, and no wallet card.
 */
export default function PublicProfile() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const client = useQueryClient();
  const session = useSession((s) => s.session);
  const { toast, show } = useToast(insets.top + 56);
  const [tab, setTab] = useState<Tab>("memes");
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const profile = useProfile(handle);
  const data = profile.data;
  const memes = useUserMemes(data?.wallet);
  const holdings = usePublicHoldings(data?.wallet);
  const follow = useFollow(handle);
  const seeker = useQuery({
    queryKey: ["seeker", data?.wallet],
    enabled: !!data,
    staleTime: 10 * 60_000,
    queryFn: () => hasSeekerGenesisToken(data!.wallet),
  });

  // Your own profile lives at /me.
  useEffect(() => {
    if (data && session && data.wallet === session.wallet)
      router.replace("/me");
  }, [data, session]);

  const items = useMemo(
    () => memes.data?.pages.flatMap((p) => p.items),
    [memes.data],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      client.invalidateQueries({ queryKey: ["profile"] }),
      client.invalidateQueries({ queryKey: ["profile-memes"] }),
      client.invalidateQueries({ queryKey: ["profile-holdings"] }),
    ]);
    setRefreshing(false);
  }, [client]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height < contentSize.height - 240)
      return;
    if (tab === "memes" && memes.hasNextPage && !memes.isFetchingNextPage)
      memes.fetchNextPage();
  };

  const label = data?.username ?? data?.wallet ?? handle;
  const share = () => {
    const url = `${config.siteUrl}/u/${label}`;
    Share.share({
      message: `${data?.displayName ?? label} on Flicko ${url}`,
      url,
    }).catch(() => {});
  };

  const copy = async () => {
    const board = clipboard();
    if (!data) return;
    if (!board) {
      show("Copying needs the latest build of the app");
      return;
    }
    await board.setStringAsync(data.wallet);
    Haptics.selectionAsync().catch(() => {});
    show("Address copied");
  };

  const toggle = async () => {
    if (!data) return;
    if (!session) {
      setConnecting(true);
      return;
    }
    const next = !data.isFollowing;
    const run = async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (!(await follow(next))) show("Couldn't update. Try again.");
    };
    if (next) await run();
    else {
      Alert.alert(`Unfollow @${label}?`, undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Unfollow", style: "destructive", onPress: run },
      ]);
    }
  };

  const notFound =
    profile.error instanceof ApiError && profile.error.status === 404;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <HeaderBar>
        <IconButton label="Share profile" onPress={share}>
          <SendIcon />
        </IconButton>
        <IconButton
          label="More"
          onPress={() =>
            Alert.alert(`@${label}`, undefined, [
              { text: "Copy address", onPress: copy },
              { text: "Cancel", style: "cancel" },
            ])
          }
        >
          <MoreIcon />
        </IconButton>
      </HeaderBar>

      {notFound ? (
        <View style={styles.missing}>
          <Text style={[type.h1, { color: colors.text }]}>No one here</Text>
          <Text style={styles.missingText}>We couldn't find @{handle}.</Text>
        </View>
      ) : (
        <ScrollView
          stickyHeaderIndices={[1]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={64}
          onScroll={onScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.text}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          <View style={styles.head}>
            {data ? (
              <>
                <Identity data={data} seeker={!!seeker.data} onCopy={copy}>
                  <ButtonRow>
                    <ProfileButton
                      label={data.isFollowing ? "Following" : "Follow"}
                      primary={!data.isFollowing}
                      onPress={toggle}
                    />
                    <ProfileButton label="Share" onPress={share} />
                  </ButtonRow>
                </Identity>
                <CreatorStrip stats={data.creatorStats} />
              </>
            ) : (
              <IdentityBones />
            )}
          </View>

          <Tabs tabs={TABS} value={tab} onChange={setTab} />

          <View style={styles.body}>
            {tab === "memes" ? (
              <MemeGrid
                items={items}
                width={width}
                loading={memes.isPending}
                emptyText="No memes yet"
              />
            ) : (
              <PublicHoldingsList
                items={holdings.data?.items}
                loading={holdings.isPending}
              />
            )}
          </View>
        </ScrollView>
      )}
      {connecting && (
        <ConnectFlow
          onClose={() => setConnecting(false)}
          onBrowse={() => setConnecting(false)}
        />
      )}
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14, gap: 14 },
  body: { paddingHorizontal: 16 },
  missing: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  missingText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: p.muted,
  },
});
