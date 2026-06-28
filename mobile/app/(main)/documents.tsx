import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/theme';
import { useDocumentsStore } from '@/stores/documents.store';
import { shareDocumentPdf, printDocument, copyDocument } from '@/services/documentActions';

function timeAgo(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return 'Just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hr ago`;
  return new Date(ts).toLocaleDateString();
}

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { documents, loaded, load, removeDocument } = useDocumentsStore();

  useEffect(() => { if (!loaded) load(); }, [loaded]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>My Documents</Text>
        <View style={{ width: 40 }} />
      </View>

      {documents.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="file-document-multiple-outline" size={56} color={COLORS.border} />
          <Text style={styles.emptyTitle}>No documents yet</Text>
          <Text style={styles.emptySub}>
            Switch to <Text style={{ fontWeight: '700', color: COLORS.primary }}>Draft</Text> mode in chat to generate a
            document, then save it here.
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={() => router.back()}>
            <Text style={styles.startBtnText}>Draft a document</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {documents.map((doc) => (
            <View key={doc.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.docIcon}>
                  <MaterialCommunityIcons name="file-document-outline" size={20} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle} numberOfLines={2}>{doc.title}</Text>
                  <Text style={styles.docDate}>{timeAgo(doc.createdAt)}</Text>
                </View>
              </View>
              <Text style={styles.docPreview} numberOfLines={2}>{doc.content.replace(/[#*_`>]/g, '')}</Text>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.act} onPress={() => shareDocumentPdf(doc.title, doc.content)}>
                  <MaterialCommunityIcons name="share-variant" size={17} color={COLORS.primary} />
                  <Text style={styles.actLabel}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.act} onPress={() => printDocument(doc.title, doc.content)}>
                  <MaterialCommunityIcons name="printer" size={17} color={COLORS.primary} />
                  <Text style={styles.actLabel}>Print</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.act}
                  onPress={async () => { await copyDocument(doc.content); Alert.alert('Copied', 'Document copied to clipboard.'); }}
                >
                  <MaterialCommunityIcons name="content-copy" size={17} color={COLORS.primary} />
                  <Text style={styles.actLabel}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.act}
                  onPress={() => Alert.alert('Delete document', `Remove "${doc.title}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => removeDocument(doc.id) },
                  ])}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={17} color={COLORS.error} />
                  <Text style={[styles.actLabel, { color: COLORS.error }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
  startBtn: {
    marginTop: 16, backgroundColor: COLORS.primary,
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24,
  },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  docIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: `${COLORS.primary}12`, alignItems: 'center', justifyContent: 'center',
  },
  docTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, lineHeight: 20 },
  docDate: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  docPreview: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  cardActions: {
    flexDirection: 'row', gap: 6, flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, paddingTop: 10,
  },
  act: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 8 },
  actLabel: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
});
