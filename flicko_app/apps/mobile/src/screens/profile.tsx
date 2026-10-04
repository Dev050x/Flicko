import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button";
import { AvatarSheet } from "@/components/profile/avatar-sheet";
import { CheckIcon, PlusIcon, SealIcon } from "@/components/ui/icons";
import { StepBar } from "@/components/ui/step-bar";
import { avatarSource, randomAvatarId } from "@/features/avatars/catalog";
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
 * Profile setup, step 1 of 2 (design-reference/ProfileSetup.html, left): every visit
 * deals a random bundled avatar unless a photo was set; the + badge opens a sheet to
 * snap or upload one instead. Username is prefilled from the wallet's .skr name with a
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
  const [photoSheet, setPhotoSheet] = useState(false);

  // A fresh random avatar on each visit, unless they've set a photo of their own.
  useEffect(() => {
    const { avatarUri: photo, avatarId: current } = useSession.getState();
    if (!photo) setAvatarId(randomAvatarId(current));
  }, [setAvatarId]);

  const snap = () => {
    setPhotoSheet(false);
    router.push("/avatar-camera");
  };

  const upload = async () => {
    setPhotoSheet(false);
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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
          accessibilityHint="Take a photo or choose one from your gallery"
          onPress={() => setPhotoSheet(true)}
          style={styles.avatarWrap}
        >
          <View style={styles.ring}>
            <View style={styles.avatar}>
              <Image
                source={avatarSource(avatarUri, avatarId)}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                onError={() => {
                  // A saved photo that won't load (deleted, or not public): deal a preset.
                  if (avatarUri?.startsWith("http")) {
                    setAvatar(null);
                    setAvatarId(randomAvatarId(avatarId));
                  }
                }}
              />
            </View>
          </View>
          <View style={styles.badge}>
            <PlusIcon size={20} color={colors.bg} />
          </View>
        </Pressable>

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

      {photoSheet && (
        <AvatarSheet
          photoUri={avatarUri}
          avatarId={avatarId}
          onSnap={snap}
          onGallery={upload}
          onClose={() => setPhotoSheet(false)}
          onSave={(id) => {
            if (id) setAvatarId(id);
            setPhotoSheet(false);
          }}
        />
      )}
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
  avatarWrap: { width: 140, height: 140 },
  // + sits on the ring at 45°, cut out from the photo by a bg-coloured border.
  badge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: colors.bg,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
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
