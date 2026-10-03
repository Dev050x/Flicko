import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { CameraIcon, CheckIcon, SealIcon } from "@/components/ui/icons";
import { StepBar } from "@/components/ui/step-bar";
import { ApiError } from "@/lib/api";
import { checkUsername, saveUsername } from "@/lib/auth";
import { hasSeekerGenesisToken } from "@/lib/seeker";
import { resolveSkrName } from "@/lib/skr";
import { useSession } from "@/store/session";
import { colors, radius, ref, type } from "@/theme";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

const PATTERN = /^(?!.*\.\.)[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/;
const CHECK_DELAY_MS = 400;

/*
 * Profile setup, step 1 of 2 (design-reference/ProfileSetup.html, left): camera-first
 * avatar, username prefilled from the wallet's .skr name with a live availability check,
 * and the Verified Seeker card when a Seeker Genesis Token is found.
 */
export default function Profile({ preview = false }: { preview?: boolean }) {
  const insets = useSafeAreaInsets();
  const session = useSession((s) => s.session);
  const avatarUri = useSession((s) => s.avatarUri);
  const signOut = useSession((s) => s.signOut);

  const [username, setUsername] = useState(preview ? "bobo.skr" : "");
  const [fromSkr, setFromSkr] = useState(preview);
  const [status, setStatus] = useState<Availability>(
    preview ? "available" : "idle",
  );
  const [seeker, setSeeker] = useState(preview);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session) return;
    resolveSkrName(session.wallet).then((name) => {
      if (!name) return;
      setUsername(name);
      setFromSkr(true);
    });
    hasSeekerGenesisToken(session.wallet).then(setSeeker);
  }, [session]);

  /*
   * Debounced check against the server; invalid names are caught locally first.
   */
  useEffect(() => {
    if (preview) return;
    const name = username.trim().toLowerCase();
    if (!name) {
      setStatus("idle");
      return;
    }
    if (!PATTERN.test(name)) {
      setStatus("invalid");
      return;
    }
    setStatus("checking");
    let live = true;
    const timer = setTimeout(() => {
      checkUsername(name, session?.token)
        .then((r) => live && setStatus(r.available ? "available" : "taken"))
        .catch(() => live && setStatus("idle"));
    }, CHECK_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [username, session, preview]);

  const next = async () => {
    if (!session || preview) return;
    setSaving(true);
    try {
      await saveUsername(username.trim().toLowerCase(), session.token);
      router.push("/permissions");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setStatus("taken");
      else console.warn("[profile] save failed", err);
    } finally {
      setSaving(false);
    }
  };

  const border =
    status === "available"
      ? ref.check
      : status === "taken" || status === "invalid"
        ? colors.loss
        : colors.border;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StepBar step={1} onBack={signOut} backLabel="Sign out" />

      <View style={styles.content}>
        <Text style={[type.h1, styles.title]} accessibilityRole="header">
          Make it yours
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            avatarUri ? "Retake your profile picture" : "Snap your profile pic"
          }
          onPress={() => router.push("/avatar-camera")}
          style={styles.ring}
        >
          <View style={styles.avatar}>
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                accessibilityLabel="Your profile picture"
              />
            ) : (
              <>
                <CameraIcon />
                <Text style={styles.avatarText}>
                  Snap your{"\n"}profile pic
                </Text>
              </>
            )}
          </View>
        </Pressable>

        <View style={styles.field}>
          <Text style={styles.label}>Username</Text>
          <View style={[styles.input, { borderColor: border }]}>
            <TextInput
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                setFromSkr(false);
              }}
              placeholder="yourname"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              accessibilityLabel="Username"
              style={styles.inputText}
            />
            <Status status={status} />
          </View>
          <Text style={styles.helper}>
            {fromSkr
              ? "Picked from your .skr name. You can change it."
              : "3–20 characters: letters, numbers, _ or ."}
          </Text>
        </View>

        {seeker && (
          <View style={styles.seeker} accessibilityLabel="Verified Seeker">
            <SealIcon />
            <View style={{ gap: 2 }}>
              <Text style={styles.seekerTitle}>Verified Seeker</Text>
              <Text style={styles.seekerText}>
                Seeker Genesis Token found in your wallet
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={[styles.footer, { bottom: 40 + insets.bottom }]}>
        <Button
          label="Continue"
          onPress={next}
          disabled={!preview && (status !== "available" || saving)}
        />
      </View>
    </View>
  );
}

function Status({ status }: { status: Availability }) {
  if (status === "available") {
    return (
      <>
        <CheckIcon />
        <Text style={[styles.status, { color: ref.check }]}>Available</Text>
      </>
    );
  }
  if (status === "taken") {
    return <Text style={[styles.status, { color: colors.loss }]}>Taken</Text>;
  }
  if (status === "invalid") {
    return (
      <Text style={[styles.status, { color: colors.loss }]}>Not allowed</Text>
    );
  }
  if (status === "checking") {
    return (
      <Text style={[styles.status, { color: ref.textSubtle }]}>Checking…</Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: {
    marginTop: 22,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 22,
  },
  title: { alignSelf: "flex-start", color: colors.text },
  ring: {
    width: 140,
    height: 140,
    borderRadius: 70,
    padding: 3,
    backgroundColor: colors.accent,
  },
  avatar: {
    flex: 1,
    borderRadius: 67,
    backgroundColor: ref.sheet,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
  },
  avatarText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    lineHeight: 17,
    color: ref.textBright,
    textAlign: "center",
  },
  field: { alignSelf: "stretch", gap: 8 },
  label: { fontFamily: "DMSans_500Medium", fontSize: 14, color: ref.textSoft },
  input: {
    height: 56,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: ref.sheet,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputText: {
    flex: 1,
    fontFamily: "DMSans_500Medium",
    fontSize: 17,
    color: colors.text,
    padding: 0,
  },
  status: { fontFamily: "DMSans_400Regular", fontSize: 13 },
  helper: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: ref.textSubtle,
  },
  seeker: {
    alignSelf: "stretch",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: ref.seekerBg,
    borderWidth: 1,
    borderColor: ref.seekerBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  seekerTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 15,
    color: colors.text,
  },
  seekerText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: ref.seekerText,
  },
  footer: { position: "absolute", left: 24, right: 24 },
});
