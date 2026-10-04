import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import {
  CameraIcon,
  CheckIcon,
  GalleryIcon,
  SealIcon,
  ShuffleIcon,
} from "@/components/ui/icons";
import { StepBar } from "@/components/ui/step-bar";
import {
  AVATARS,
  avatarSource,
  randomAvatarId,
} from "@/features/avatars/catalog";
import { uploadAvatar } from "@/features/avatars/upload";
import { ApiError } from "@/lib/api";
import { checkUsername, saveProfile } from "@/lib/auth";
import { imagePicker } from "@/lib/native";
import { hasSeekerGenesisToken } from "@/lib/seeker";
import { resolveSkrName } from "@/lib/skr";
import { useSession } from "@/store/session";
import { colors, radius, ref, type } from "@/theme";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

const PATTERN = /^(?!.*\.\.)[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/;
const CHECK_DELAY_MS = 400;

/*
 * Profile setup, step 1 of 2 (design-reference/ProfileSetup.html, left): the avatar starts
 * as a random bundled one, which can be shuffled, picked from the row, or replaced by a
 * snapped or uploaded photo. Username is prefilled from the wallet's .skr name with a
 * live availability check, and the Verified Seeker card shows when a Seeker Genesis
 * Token is found. Continue saves the name and avatar; a local photo is uploaded first.
 */
export default function Profile({ preview = false }: { preview?: boolean }) {
  const insets = useSafeAreaInsets();
  const session = useSession((s) => s.session);
  const avatarUri = useSession((s) => s.avatarUri);
  const avatarId = useSession((s) => s.avatarId);
  const setAvatar = useSession((s) => s.setAvatar);
  const setAvatarId = useSession((s) => s.setAvatarId);
  const signOut = useSession((s) => s.signOut);

  const [username, setUsername] = useState(preview ? "bobo.skr" : "");
  const [fromSkr, setFromSkr] = useState(preview);
  const [status, setStatus] = useState<Availability>(
    preview ? "available" : "idle",
  );
  const [seeker, setSeeker] = useState(preview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Everyone starts with an avatar: a random bundled one until they pick or snap.
  useEffect(() => {
    if (!avatarUri && !avatarId) setAvatarId(randomAvatarId());
  }, [avatarUri, avatarId, setAvatarId]);

  const upload = async () => {
    const picker = imagePicker();
    if (!picker) {
      setError("Uploading needs a new build of the app. Snap one instead.");
      return;
    }
    const result = await picker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setError(null);
    setAvatar(asset.uri);
  };

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
    setError(null);
    try {
      await saveProfile(
        {
          username: username.trim().toLowerCase(),
          ...(avatarUri ? {} : { avatarId }),
        },
        session.token,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setStatus("taken");
      else console.warn("[profile] save failed", err);
      setSaving(false);
      return;
    }
    // A photo still on the phone goes up now; the stored copy replaces the local file.
    if (avatarUri?.startsWith("file:")) {
      try {
        const user = await uploadAvatar(avatarUri, session.token);
        if (user.avatarUrl) setAvatar(user.avatarUrl);
      } catch (err) {
        console.warn("[profile] avatar upload failed", err);
        setError(
          err instanceof ApiError && err.status === 413
            ? err.message
            : "Couldn't upload your photo. Try again or pick an avatar.",
        );
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    router.push("/permissions");
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

        <View style={styles.ring}>
          <View style={styles.avatar}>
            <Image
              source={avatarSource(avatarUri, avatarId)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityLabel="Your profile picture"
            />
          </View>
        </View>

        <View style={styles.actions}>
          <Action
            label="Snap"
            icon={<CameraIcon size={18} color={ref.textBright} />}
            onPress={() => router.push("/avatar-camera")}
          />
          <Action
            label="Upload"
            icon={<GalleryIcon size={18} color={ref.textBright} />}
            onPress={upload}
          />
          <Action
            label="Shuffle"
            icon={<ShuffleIcon size={18} color={ref.textBright} />}
            onPress={() => setAvatarId(randomAvatarId(avatarId))}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.presets}
          contentContainerStyle={styles.presetRow}
        >
          {AVATARS.map((a) => {
            const on = !avatarUri && a.id === avatarId;
            return (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={a.name}
                accessibilityState={{ selected: on }}
                onPress={() => setAvatarId(a.id)}
                style={[styles.preset, on && styles.presetOn]}
              >
                <Image source={a.source} style={styles.presetImage} />
              </Pressable>
            );
          })}
        </ScrollView>

        {error && <Text style={styles.error}>{error}</Text>}

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

function Action({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
    >
      {icon}
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
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
  actions: { flexDirection: "row", gap: 10, marginTop: -6 },
  action: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: ref.sheet,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: ref.textBright,
  },
  presets: { alignSelf: "stretch", marginHorizontal: -24, flexGrow: 0 },
  presetRow: { paddingHorizontal: 24, gap: 10 },
  preset: {
    width: 52,
    height: 52,
    borderRadius: 26,
    padding: 2,
    borderWidth: 2,
    borderColor: "transparent",
  },
  presetOn: { borderColor: ref.textBright },
  presetImage: { flex: 1, borderRadius: 22 },
  error: {
    alignSelf: "stretch",
    marginTop: -8,
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: colors.loss,
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
