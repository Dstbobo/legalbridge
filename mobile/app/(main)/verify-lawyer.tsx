import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Image, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/theme';
import {
  submitVerification, getMyVerification, type LawyerVerification,
} from '@/services/lawyers.service';

const SPECIALTIES = [
  'Land & Property', 'Criminal', 'Corporate', 'Family Law',
  'Employment', 'Human Rights', 'Tax', 'Intellectual Property',
];

export default function VerifyLawyerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [existing, setExisting] = useState<LawyerVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [scn, setScn] = useState('');
  const [yearOfCall, setYearOfCall] = useState('');
  const [state, setState] = useState('');
  const [firm, setFirm] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [specs, setSpecs] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [certUri, setCertUri] = useState<string | null>(null);

  useEffect(() => {
    getMyVerification()
      .then((v) => {
        setExisting(v);
        if (v) {
          setFullName(v.full_name); setScn(v.scn_number);
          setYearOfCall(v.year_of_call ? String(v.year_of_call) : '');
          setState(v.state ?? ''); setFirm(v.firm ?? '');
          setWhatsapp(v.whatsapp ?? ''); setSpecs(v.specializations ?? []);
          setBio(v.bio ?? '');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function pickCert() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.8, allowsEditing: false,
    });
    if (!res.canceled && res.assets?.[0]?.uri) setCertUri(res.assets[0].uri);
  }

  function toggleSpec(s: string) {
    setSpecs((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  async function submit() {
    if (!fullName.trim() || fullName.trim().split(' ').length < 2) {
      Alert.alert('Full name required', 'Enter your full legal name as it appears on your call-to-bar certificate.');
      return;
    }
    if (!scn.trim() || scn.trim().length < 5) {
      Alert.alert('SCN required', 'Enter your Supreme Court enrolment number (e.g. SCN012345).');
      return;
    }
    if (!certUri && !existing?.cert_path) {
      Alert.alert('Certificate required', 'Upload a clear photo of your Call to Bar certificate. This is how we keep fake lawyers out.');
      return;
    }
    setSaving(true);
    try {
      await submitVerification({
        fullName, scnNumber: scn,
        yearOfCall: yearOfCall ? parseInt(yearOfCall, 10) : null,
        state, firm, whatsapp, specializations: specs, bio, certUri,
      });
      Alert.alert(
        'Application submitted ✓',
        'Our team will review your SCN and certificate. You will appear in the Lawyers directory once verified (usually within 24–48 hours).',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Submission failed', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Already verified — nothing to do.
  if (existing?.status === 'verified') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onBack={() => router.back()} />
        <View style={[styles.center, { flex: 1, padding: 32 }]}>
          <MaterialCommunityIcons name="check-decagram" size={64} color="#2ecc71" />
          <Text style={styles.statusTitle}>You are verified ✓</Text>
          <Text style={styles.statusBody}>
            Your SCN has been confirmed. You now appear in the Lawyers directory and clients can contact you.
          </Text>
        </View>
      </View>
    );
  }

  // Pending — show status instead of the form.
  if (existing?.status === 'pending') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header onBack={() => router.back()} />
        <View style={[styles.center, { flex: 1, padding: 32 }]}>
          <MaterialCommunityIcons name="clock-outline" size={64} color={COLORS.accent} />
          <Text style={styles.statusTitle}>Under review</Text>
          <Text style={styles.statusBody}>
            We are reviewing your SCN ({existing.scn_number}) and certificate. You will appear in the
            Lawyers directory once verified — usually within 24–48 hours.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 14 }} showsVerticalScrollIndicator={false}>
        {existing?.status === 'rejected' && (
          <View style={styles.rejectedBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={COLORS.error} />
            <Text style={styles.rejectedText}>
              Your previous application was not approved{existing.admin_note ? `: ${existing.admin_note}` : '.'} Please correct and resubmit.
            </Text>
          </View>
        )}

        <View style={styles.introBox}>
          <MaterialCommunityIcons name="shield-check-outline" size={20} color={COLORS.primary} />
          <Text style={styles.introText}>
            To protect clients from impersonation, every lawyer on LegalBridge is verified against their
            Supreme Court enrolment before appearing in the directory.
          </Text>
        </View>

        <Field label="Full legal name *" value={fullName} onChange={setFullName} placeholder="As on your Call to Bar certificate" />
        <Field label="SCN / Enrolment number *" value={scn} onChange={setScn} placeholder="e.g. SCN012345" autoCapitalize="characters" />
        <Field label="Year of call" value={yearOfCall} onChange={setYearOfCall} placeholder="e.g. 2015" keyboardType="number-pad" />
        <Field label="State of practice" value={state} onChange={setState} placeholder="e.g. Lagos" />
        <Field label="Firm / Chambers" value={firm} onChange={setFirm} placeholder="e.g. Okonkwo & Associates" />
        <Field label="WhatsApp number" value={whatsapp} onChange={setWhatsapp} placeholder="+234..." keyboardType="phone-pad" />

        <Text style={styles.label}>Specialisations</Text>
        <View style={styles.specRow}>
          {SPECIALTIES.map((s) => {
            const on = specs.includes(s);
            return (
              <TouchableOpacity key={s} style={[styles.specChip, on && styles.specChipOn]} onPress={() => toggleSpec(s)}>
                <Text style={[styles.specChipText, on && { color: '#fff' }]}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Short bio (shown to clients)</Text>
        <TextInput
          style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
          value={bio} onChangeText={setBio} multiline maxLength={500}
          placeholder="e.g. Property law specialist with 10 years' experience in tenancy and land matters…"
          placeholderTextColor={COLORS.textSecondary}
        />

        <Text style={styles.label}>Call to Bar certificate *</Text>
        <TouchableOpacity style={styles.certBox} onPress={pickCert} activeOpacity={0.8}>
          {certUri ? (
            <Image source={{ uri: certUri }} style={styles.certPreview} resizeMode="cover" />
          ) : (
            <>
              <MaterialCommunityIcons name="file-upload-outline" size={30} color={COLORS.primary} />
              <Text style={styles.certText}>
                {existing?.cert_path ? 'Certificate on file — tap to replace' : 'Tap to upload a clear photo'}
              </Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.privacyNote}>
          Your certificate is stored privately and used only for verification. It is never shown to other users.
        </Text>

        <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>Submit for verification</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Lawyer Verification</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, autoCapitalize }: {
  label: string; value: string; onChange: (t: string) => void; placeholder?: string;
  keyboardType?: any; autoCapitalize?: any;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textSecondary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'words'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  introBox: {
    flexDirection: 'row', gap: 10, backgroundColor: `${COLORS.primary}0d`,
    borderRadius: 12, borderWidth: 1, borderColor: `${COLORS.primary}25`, padding: 14,
  },
  introText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 19 },
  rejectedBox: {
    flexDirection: 'row', gap: 10, backgroundColor: `${COLORS.error}10`,
    borderRadius: 12, borderWidth: 1, borderColor: `${COLORS.error}30`, padding: 14,
  },
  rejectedText: { flex: 1, fontSize: 13, color: COLORS.error, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  input: {
    backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14.5, color: COLORS.text,
  },
  specRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  specChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  specChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  specChipText: { fontSize: 12.5, color: COLORS.textSecondary, fontWeight: '600' },
  certBox: {
    height: 150, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border,
    borderStyle: 'dashed', backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden',
  },
  certPreview: { width: '100%', height: '100%' },
  certText: { fontSize: 13, color: COLORS.textSecondary },
  privacyNote: { fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 16 },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 6,
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15.5 },
  statusTitle: { fontSize: 21, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  statusBody: { fontSize: 14.5, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
});
