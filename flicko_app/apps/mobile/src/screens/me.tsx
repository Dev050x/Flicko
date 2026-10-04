import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
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
  ActivityList,
  HoldingsList,
  MemeGrid,
  Tabs,
} from "@/components/profile/lists";
import { MoneyCard, type Money } from "@/components/profile/money-card";
import { Bone } from "@/components/profile/skeleton";
import { Button } from "@/components/ui/button";
import { SendIcon, SettingsIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { ConnectFlow } from "@/components/wallet/connect-flow";
import { config } from "@/config";
import {
  portfolioChangePct,
  skrOf,
  useActivity,
  useEarnings,
  usePortfolio,
  useProfile,
  useSolBalance,
  useUserMemes,
} from "@/features/profile/api";
import { ClaimProblem, useClaim } from "@/features/profile/claim";
import { useSkrBalance } from "@/features/wallet/skr-balance";
import { clipboard } from "@/lib/native";
import { hasSeekerGenesisToken } from "@/lib/seeker";
import { useSession } from "@/store/session";
import { colors, type } from "@/theme";

const TABS = [
  { id: "memes", label: "Memes" },
  { id: "holdings", label: "Holdings" },
  { id: "activity", label: "Activity" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/*
 * Your profile (flicko-profile-kit): identity, one money card (portfolio + creator
 * earnings with Claim), then Memes / Holdings / Activity under sticky tabs. Guests get a
 * connect prompt instead of empty data.
 */
export default function Me() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const session = useSession((s) => s.session);
  const wallet = session?.wallet;
  const client = useQueryClient();
  const { toast, show } = useToast(insets.top + 56);
  const [tab, setTab] = useState<Tab>("memes");
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const profile = useProfile(wallet);
  const portfolio = usePortfolio();
  const earnings = useEarnings();
  const skr = useSkrBalance(wallet);
  const sol = useSolBalance(wallet);
  const memes = useUserMemes(wallet);
  const activity = useActivity();
  const claim = useClaim();
  const seeker = useQuery({
    queryKey: ["seeker", wallet],
    enabled: !!wallet,
    staleTime: 10 * 60_000,
    queryFn: () => hasSeekerGenesisToken(wallet!),
  });

  const money = useMemo<Money | null>(() => {
    if (!portfolio.data || !earnings.data || !profile.data) return null;
    const cash = skr.data ?? 0;
    const memesValue = skrOf(portfolio.data.totals.value);
    return {
      total: cash + memesValue,
      changePct: portfolioChangePct(portfolio.data.holdings, cash),
      cash,
      memes: memesValue,
      sol: sol.data ?? 0,
      claimable: skrOf(earnings.data.totals.claimable),
      allTime: skrOf(earnings.data.totals.earned),
      launched: profile.data.counts.memes > 0 || earnings.data.items.length > 0,
    };
  }, [portfolio.data, earnings.data, profile.data, skr.data, sol.data]);

  const memeItems = useMemo(
    () => memes.data?.pages.flatMap((p) => p.items),
    [memes.data],
  );
  const activityItems = useMemo(
    () => activity.data?.pages.flatMap((p) => p.items),
    [activity.data],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      client.invalidateQueries({ queryKey: ["profile"] }),
      client.invalidateQueries({ queryKey: ["profile-memes"] }),
      client.invalidateQueries({ queryKey: ["portfolio"] }),
      client.invalidateQueries({ queryKey: ["earnings"] }),
      client.invalidateQueries({ queryKey: ["activity"] }),
      skr.refetch(),
      sol.refetch(),
    ]);
    setRefreshing(false);
  }, [client, skr, sol]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height < contentSize.height - 240)
      return;
    if (tab === "memes" && memes.hasNextPage && !memes.isFetchingNextPage)
      memes.fetchNextPage();
    if (
      tab === "activity" &&
      activity.hasNextPage &&
      !activity.isFetchingNextPage
    )
      activity.fetchNextPage();
  };

  const copy = async () => {
    const board = clipboard();
    if (!wallet) return;
    if (!board) {
      show("Copying needs the latest build of the app");
      return;
    }
    await board.setStringAsync(wallet);
    Haptics.selectionAsync().catch(() => {});
    show("Address copied");
  };

  const share = () => {
    if (!profile.data) return;
    const handle = profile.data.username ?? profile.data.wallet;
    const url = `${config.siteUrl}/u/${handle}`;
    Share.share({
      message: `${profile.data.displayName ?? handle} on Flicko ${url}`,
      url,
    }).catch(() => {});
  };

  const onClaim = async () => {
    try {
      const claimed = await claim.run();
      if (claimed === null) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      show(
        `Claimed ${claimed.toLocaleString("en-US", { maximumFractionDigits: 2 })} SKR`,
      );
    } catch (err) {
      show(
        err instanceof ClaimProblem
          ? err.message
          : "Something went wrong. Try again.",
      );
    }
  };

  if (!session) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <HeaderBar />
        <View style={styles.guest}>
          <Text style={[type.h1, { color: colors.text }]}>Your profile</Text>
          <Text style={styles.guestText}>
            Connect a wallet to see your portfolio, creator earnings and the
            memes you launch.
          </Text>
          <View style={{ alignSelf: "stretch" }}>
            <Button
              label="Connect wallet"
              onPress={() => setConnecting(true)}
            />
          </View>
        </View>
        {connecting && (
          <ConnectFlow
            onClose={() => setConnecting(false)}
            onBrowse={() => setConnecting(false)}
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <HeaderBar>
        <IconButton label="Share profile" onPress={share}>
          <SendIcon />
        </IconButton>
        <IconButton label="Settings" onPress={() => router.push("/settings")}>
          <SettingsIcon />
        </IconButton>
      </HeaderBar>

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
          {profile.data ? (
            <Identity
              data={profile.data}
              seeker={!!seeker.data}
              onAvatar={() => router.push("/edit-profile")}
              onCopy={copy}
            >
              <ButtonRow>
                <ProfileButton
                  label="Edit profile"
                  onPress={() => router.push("/edit-profile")}
                />
                <ProfileButton label="Share profile" onPress={share} />
              </ButtonRow>
            </Identity>
          ) : (
            <IdentityBones />
          )}
          <MoneyCard
            money={money}
            claiming={claim.claiming}
            onClaim={onClaim}
            onOpenCamera={() => router.navigate("/camera")}
          />
        </View>

        <Tabs tabs={TABS} value={tab} onChange={setTab} />

        <View style={styles.body}>
          {tab === "memes" && (
            <MemeGrid
              items={memeItems}
              width={width}
              loading={memes.isPending}
              emptyText="No memes yet"
              emptyAction="Snap your first"
              onEmptyAction={() => router.navigate("/camera")}
            />
          )}
          {tab === "holdings" && (
            <HoldingsList
              items={portfolio.data?.holdings}
              totalValue={money?.memes ?? 0}
              loading={portfolio.isPending}
              onExplore={() => router.navigate("/markets")}
            />
          )}
          {tab === "activity" && (
            <ActivityList items={activityItems} loading={activity.isPending} />
          )}
        </View>
      </ScrollView>
      {toast}
    </View>
  );
}

export const IdentityBones = () => (
  <View style={{ gap: 14 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
      <Bone width={84} height={84} radius={42} />
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          justifyContent: "space-around",
        }}
      >
        {[0, 1, 2].map((i) => (
          <Bone key={i} width={48} height={34} />
        ))}
      </View>
    </View>
    <Bone width={140} height={22} />
    <Bone width={200} height={16} />
    <Bone width="85%" height={16} />
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14, gap: 14 },
  body: { paddingHorizontal: 16 },
  guest: { flex: 1, paddingHorizontal: 24, justifyContent: "center", gap: 14 },
  guestText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    lineHeight: 22,
    color: "#8E86A0",
  },
});
