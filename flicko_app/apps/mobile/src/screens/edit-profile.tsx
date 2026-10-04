import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AvatarSheet } from "@/components/profile/avatar-sheet";
import { HeaderBar } from "@/components/profile/header-bar";
import { Bone } from "@/components/profile/skeleton";
import { Button } from "@/components/ui/button";
import { avatarSource } from "@/features/avatars/catalog";
import { uploadAvatar } from "@/features/avatars/upload";
import { useProfile } from "@/features/profile/api";
import { ApiError } from "@/lib/api";
import { checkUsername, saveProfile } from "@/lib/auth";
import { imagePicker } from "@/lib/native";
import { useSession } from "@/store/session";
import { colors, profile as p, radius, type } from "@/theme";

const PATTERN = /^(?!.*\.\.)[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$/;
const BIO_MAX = 160;

/*
 * Edit profile: picture (character or your own photo), name, @handle (live availability
 * check, as on sign-up) and bio. Save sends only what changed; a new photo uploads first.
 */
export default function EditProfile() {
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const session = useSession((s) => s.session);
  const setAvatar = useSession((s) => s.setAvatar);
  const setAvatarId = useSession((s) => s.setAvatarId);
  const { data } = useProfile(session?.wallet);

  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [character, setCharacter] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "checking" | "ok" | "taken" | "invalid"
  >("idle");

  useEffect(() => {
    if (!data || ready) return;
    setName(data.displayName ?? "");
    setHandle(data.username ?? "");
    setBio(data.bio ?? "");
    setPhoto(data.avatarUrl);
    setCharacter(data.avatarId);
    setReady(true);
  }, [data, ready]);

  const original = data?.username ?? "";
  useEffect(() => {
    const next = handle.trim().toLowerCase();
    if (!ready || next === original) {
      setStatus("idle");
      return;
    }
    if (!PATTERN.test(next)) {
      setStatus("invalid");
      return;
    }
    setStatus("checking");
    let live = true;
    const timer = setTimeout(() => {
      checkUsername(next, session?.token)
        .then((r) => live && setStatus(r.available ? "ok" : "taken"))
        .catch(() => live && setStatus("idle"));
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [handle, original, ready, session?.token]);

  const pick = async (camera: boolean) => {
    setSheet(false);
    const picker = imagePicker();
    if (!picker) {
      setError("Photos need the latest build of the app.");
      return;
    }
    const options = {
      mediaTypes: ["images"] as "images"[],
      allowsEditing: true,
      aspect: [1, 1] as [number, number],
      quality: 0.8,
    };
    const result = camera
      ? await picker.launchCameraAsync(options)
      : await picker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setError(null);
    setPhoto(asset.uri);
    setCharacter(null);
  };

  const dirty =
    !!data &&
    (name.trim() !== (data.displayName ?? "") ||
      handle.trim().toLowerCase() !== original ||
      bio.trim() !== (data.bio ?? "") ||
      photo !== data.avatarUrl ||
      character !== data.avatarId);
  const blocked =
    status === "taken" || status === "invalid" || status === "checking";

  const save = async () => {
    if (!session || !data || saving) return;
    setSaving(true);
    setError(null);
    try {
      const nextHandle = handle.trim().toLowerCase();
      const body = {
        ...(name.trim() !== (data.displayName ?? "")
          ? { displayName: name.trim() }
          : {}),
        ...(nextHandle !== original && nextHandle
          ? { username: nextHandle }
          : {}),
        ...(bio.trim() !== (data.bio ?? "") ? { bio: bio.trim() } : {}),
        ...(character && character !== data.avatarId
          ? { avatarId: character }
          : {}),
      };
      if (Object.keys(body).length) await saveProfile(body, session.token);
      if (character && character !== data.avatarId) setAvatarId(character);
      if (photo?.startsWith("file:")) {
        const user = await uploadAvatar(photo, session.token);
        if (user.avatarUrl) setAvatar(user.avatarUrl);
      }
      await client.invalidateQueries({ queryKey: ["profile"] });
      router.back();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setStatus("taken");
      else if (err instanceof ApiError && err.status === 413)
        setError(err.message);
      else setError("Couldn't save. Check your connection and try again.");
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <HeaderBar />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingBottom: 120 }]}
      >
        <Text
          style={[type.h1, { color: colors.text }]}
          accessibilityRole="header"
        >
          Edit profile
        </Text>

        {!ready ? (
          <View style={{ gap: 16 }}>
            <Bone
              width={96}
              height={96}
              radius={48}
              style={{ alignSelf: "center" }}
            />
            <Bone width="100%" height={56} radius={radius.md} />
            <Bone width="100%" height={56} radius={radius.md} />
            <Bone width="100%" height={96} radius={radius.md} />
          </View>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change profile picture"
              onPress={() => setSheet(true)}
              style={styles.avatarWrap}
            >
              <Image
                source={avatarSource(photo, character)}
                style={styles.avatar}
                contentFit="cover"
              />
              <Text style={styles.change}>Change picture</Text>
            </Pressable>

            <Field label="Name">
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={30}
                placeholder="Your name"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                accessibilityLabel="Name"
              />
            </Field>

            <Field
              label="Handle"
              note={
                status === "taken"
                  ? "That handle is taken"
                  : status === "invalid"
                    ? "3–20 characters: letters, numbers, _ or ."
                    : status === "ok"
                      ? "Available"
                      : undefined
              }
              bad={status === "taken" || status === "invalid"}
            >
              <TextInput
                value={handle}
                onChangeText={setHandle}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                placeholder="yourname"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                accessibilityLabel="Handle"
              />
            </Field>

            <Field label="Bio" note={`${bio.length}/${BIO_MAX}`}>
              <TextInput
                value={bio}
                onChangeText={setBio}
                maxLength={BIO_MAX}
                multiline
                placeholder="Tell people what you snap"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, styles.bio]}
                accessibilityLabel="Bio"
              />
            </Field>

            {error && <Text style={styles.error}>{error}</Text>}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          label={saving ? "Saving…" : "Save"}
          onPress={save}
          disabled={!ready || !dirty || blocked || saving}
        />
      </View>

      {sheet && (
        <AvatarSheet
          photoUri={photo}
          avatarId={character}
          onSnap={() => pick(true)}
          onGallery={() => pick(false)}
          onClose={() => setSheet(false)}
          onSave={(id) => {
            if (id) {
              setCharacter(id);
              setPhoto(null);
            }
            setSheet(false);
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  note,
  bad,
  children,
}: {
  label: string;
  note?: string;
  bad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.fieldHead}>
        <Text style={styles.label}>{label}</Text>
        {note && (
          <Text style={[styles.note, bad && { color: colors.loss }]}>
            {note}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 24, paddingTop: 8, gap: 20 },
  avatarWrap: { alignItems: "center", gap: 10 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  change: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.text },
  fieldHead: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontFamily: "DMSans_500Medium", fontSize: 14, color: "#B9AED3" },
  note: { fontFamily: "DMSans_400Regular", fontSize: 13, color: p.muted },
  input: {
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: p.card,
    borderWidth: 1.5,
    borderColor: p.line,
    fontFamily: "DMSans_500Medium",
    fontSize: 16,
    color: colors.text,
  },
  bio: { minHeight: 96, paddingTop: 16, textAlignVertical: "top" },
  error: { fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.loss },
  footer: { position: "absolute", left: 24, right: 24, bottom: 0 },
});
