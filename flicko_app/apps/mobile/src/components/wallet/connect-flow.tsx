import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { Button, Chip, TextButton } from "@/components/ui/button";
import { CheckIcon, RefreshIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { config } from "@/config";
import { ApiError } from "@/lib/api";
import { fetchSignInInput, verifySignIn } from "@/lib/auth";
import { ConnectError, connectAndSignIn } from "@/lib/mwa";
import { useSession, type Session } from "@/store/session";
import { colors, radius, ref, type } from "@/theme";

export type ConnectState = "opening" | "success" | "noWallet" | "failed";

const SUCCESS_MS = 1200;

/*
 * The wallet connect flow (design-reference/ConnectStates.html). One MWA approval
 * connects and signs in; the server verifies the signature and returns the session.
 * `preview` freezes a state for the dev preview screen.
 */
export function ConnectFlow({
  onClose,
  onBrowse,
  preview,
}: {
  onClose: () => void;
  onBrowse: () => void;
  preview?: ConnectState;
}) {
  const signIn = useSession((s) => s.signIn);
  const [state, setState] = useState<ConnectState>(preview ?? "opening");
  const [connected, setConnected] = useState<Session | null>(null);
  const attempt = useRef(0);

  const start = useCallback(async () => {
    const id = ++attempt.current;
    const current = () => id === attempt.current;
    setState("opening");
    try {
      const input = await fetchSignInInput();
      const wallet = await connectAndSignIn(input);
      const verified = await verifySignIn({
        address: wallet.address,
        message: wallet.signedMessage,
        signature: wallet.signature,
      });
      if (!current()) return;
      // Returning users get the avatar they saved before (photo first, then bundled one).
      const { user } = verified;
      if (user.avatarUrl) useSession.getState().setAvatar(user.avatarUrl);
      else if (user.avatarId) useSession.getState().setAvatarId(user.avatarId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      setConnected({
        wallet: wallet.address,
        token: verified.token,
        expiresAt: verified.expiresAt,
        mwaAuthToken: wallet.authToken,
        walletLabel: wallet.walletLabel,
      });
      setState("success");
    } catch (err) {
      if (!current()) return;
      if (err instanceof ConnectError && err.reason === "noWallet") {
        setState("noWallet");
        return;
      }
      if (err instanceof ApiError || !(err instanceof ConnectError)) {
        console.warn("[connect] sign-in failed", err);
      }
      setState("failed");
    }
  }, []);

  useEffect(() => {
    if (!preview) start();
  }, [preview, start]);

  /*
   * After the "gm" moment the session is saved, which moves the app on to the profile.
   */
  useEffect(() => {
    if (state !== "success" || !connected) return;
    const timer = setTimeout(() => signIn(connected), SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [state, connected, signIn]);

  const cancel = () => {
    attempt.current++;
    onClose();
  };

  if (state === "success") {
    return <Success session={connected} />;
  }
  if (state === "noWallet") {
    return (
      <Sheet height={470} onClose={cancel} still={!!preview}>
        <Title>You need a Solana wallet</Title>
        <Body>
          Your wallet is your Flicko account. Install one, then come back here.
        </Body>
        {config.wallets.map((wallet) => (
          <WalletRow key={wallet.playId} {...wallet} />
        ))}
        <View style={{ flex: 1 }} />
        <Wide>
          <TextButton label="I've installed one, try again" onPress={start} />
        </Wide>
      </Sheet>
    );
  }
  if (state === "failed") {
    return (
      <Sheet height={400} onClose={cancel} still={!!preview}>
        <View style={styles.roundIcon}>
          <RefreshIcon />
        </View>
        <Title>No worries, connect anytime</Title>
        <Body>
          Your wallet didn't confirm the sign-in. Nothing was signed or sent.
        </Body>
        <View style={{ flex: 1 }} />
        <Wide>
          <Button label="Try again" onPress={start} />
          <TextButton label="Just browse" onPress={onBrowse} />
        </Wide>
      </Sheet>
    );
  }
  return (
    <Sheet height={430} onClose={cancel} still={!!preview}>
      <View style={{ height: 6 }} />
      <Spinner frozen={preview === "opening"} />
      <Title>Opening your wallet…</Title>
      <Body>
        Approve the sign-in in your wallet to continue. On Seeker this opens
        Seed Vault.
      </Body>
      <View style={styles.chips}>
        {["One approval", "No fees", "Keys stay in your wallet"].map(
          (label) => (
            <Chip key={label} icon={<CheckIcon />} label={label} />
          ),
        )}
      </View>
      <View style={{ flex: 1 }} />
      <Wide>
        <TextButton label="Cancel" onPress={cancel} />
      </Wide>
    </Sheet>
  );
}

/*
 * Full-screen success: gain check, "gm", the shortened address and the wallet's name.
 */
function Success({ session }: { session: Session | null }) {
  const { height } = useWindowDimensions();
  const address = session?.wallet ?? "7xKpQm4Wc9vB2nT8sLd1jR5yHf6aE3fQa";
  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
      <View style={[styles.success, { top: (300 / 920) * height }]}>
        <View style={styles.successCheck}>
          <CheckIcon size={48} color={colors.bg} />
        </View>
        <Text style={[type.gm, { color: colors.text }]}>gm</Text>
        <View style={styles.addressChip} accessibilityLabel={`Wallet ${short}`}>
          <Text style={styles.addressText}>{short}</Text>
        </View>
        <Text style={styles.subtle}>
          Connected with {session?.walletLabel ?? "Seed Vault"}
        </Text>
      </View>
      <Text style={[styles.subtle, styles.footer]}>
        Setting up your profile…
      </Text>
    </View>
  );
}

/*
 * Accent arc on a track, turning once a second.
 */
function Spinner({ frozen }: { frozen: boolean }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    if (frozen) return;
    turn.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(turn);
  }, [frozen, turn]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value * 360}deg` }],
  }));
  return (
    <Animated.View style={style} accessibilityLabel="Waiting for your wallet">
      <Svg viewBox="0 0 64 64" width={64} height={64}>
        <Circle
          cx={32}
          cy={32}
          r={26}
          fill="none"
          stroke={ref.line}
          strokeWidth={6}
        />
        <Circle
          cx={32}
          cy={32}
          r={26}
          fill="none"
          stroke={colors.accent}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={[60, 200]}
          transform="rotate(-90 32 32)"
        />
      </Svg>
    </Animated.View>
  );
}

/*
 * Install row. Official logos go in assets/wallets/<name>.png; until a human adds
 * them, a neutral tile with the first letter stands in.
 */
const walletLogos: Record<string, number | undefined> = {};

function WalletRow({ name, playId }: { name: string; playId: string }) {
  const logo = walletLogos[name.toLowerCase()];
  const install = () =>
    Linking.openURL(`market://details?id=${playId}`).catch(() =>
      Linking.openURL(
        `https://play.google.com/store/apps/details?id=${playId}`,
      ),
    );
  return (
    <View style={styles.walletRow}>
      {logo ? (
        <Image
          source={logo}
          style={styles.walletLogo}
          accessibilityLabel={`${name} logo`}
        />
      ) : (
        <View style={styles.walletLogo} accessibilityLabel={`${name} logo`}>
          <Text style={styles.walletLetter}>{name[0]}</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.walletName}>{name}</Text>
        <Text style={styles.walletStore}>Get it on Google Play</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Install ${name}`}
        onPress={install}
        hitSlop={8}
        style={styles.install}
      >
        <Text style={styles.installText}>Install</Text>
      </Pressable>
    </View>
  );
}

const Title = ({ children }: { children: string }) => (
  <Text style={styles.title}>{children}</Text>
);
const Body = ({ children }: { children: string }) => (
  <Text style={styles.body}>{children}</Text>
);
const Wide = ({ children }: { children: React.ReactNode }) => (
  <View style={{ alignSelf: "stretch", gap: 4 }}>{children}</View>
);

const styles = StyleSheet.create({
  title: { ...type.sheetTitle, color: colors.text, textAlign: "center" },
  body: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    lineHeight: 22.5,
    color: ref.textSoft,
    textAlign: "center",
    maxWidth: 330,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  roundIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
  },
  success: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 18,
  },
  successCheck: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.gain,
    alignItems: "center",
    justifyContent: "center",
  },
  addressChip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: ref.sheet,
    borderWidth: 1,
    borderColor: ref.line,
    justifyContent: "center",
  },
  addressText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 15,
    color: ref.textBright,
  },
  subtle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: ref.textSubtle,
    textAlign: "center",
  },
  footer: { position: "absolute", left: 0, right: 0, bottom: 48 },
  walletRow: {
    alignSelf: "stretch",
    height: 68,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  walletLogo: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
  },
  walletLetter: {
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
    color: ref.textBright,
  },
  walletName: {
    fontFamily: "DMSans_500Medium",
    fontSize: 16,
    color: colors.text,
  },
  walletStore: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: colors.textFaint,
  },
  install: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.accent,
    justifyContent: "center",
  },
  installText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
    color: colors.accentText,
  },
});
