"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Chip, Card, CardContent, Stack, InputAdornment,
  CircularProgress, FormControl, InputLabel, Select, MenuItem,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";

interface Sentence { id: string; japanese: string; english: string; source: string; }

export default function SentencesPage() {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [total, setTotal] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const fetchSentences = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ limit: "100" });
    if (search) p.set("q", search);
    if (sourceFilter) p.set("source", sourceFilter);
    const res = await fetch(`/api/sentences?${p}`);
    const data = await res.json();
    setSentences(data.sentences ?? []);
    setTotal(data.total ?? 0);
    setSources(data.sources ?? []);
    setLoading(false);
  }, [search, sourceFilter]);

  useEffect(() => {
    const t = setTimeout(fetchSentences, 300);
    return () => clearTimeout(t);
  }, [fetchSentences]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this sentence?")) return;
    await fetch(`/api/sentences/${id}`, { method: "DELETE" });
    fetchSentences();
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Sentences</Typography>
          {!loading && <Typography variant="body2" color="text.secondary">{total} sentences</Typography>}
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          Add sentence
        </Button>
      </Stack>

      <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
        <TextField
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ flex: 1, minWidth: 200 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Source</InputLabel>
          <Select value={sourceFilter} label="Source" onChange={(e) => setSourceFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {sources.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}><CircularProgress /></Box>
      ) : sentences.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: "center", py: 6 }}>
          No sentences yet. Add one or run <code>bun run seed:sentences</code>.
        </Typography>
      ) : (
        <Stack gap={1.5}>
          {sentences.map((s) => (
            <Card key={s.id} variant="outlined">
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Stack direction="row" alignItems="flex-start" gap={1}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body1" fontWeight={500} lang="ja" gutterBottom>
                      {s.japanese}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {s.english}
                    </Typography>
                  </Box>
                  <Stack direction="row" alignItems="center" gap={0.5} sx={{ flexShrink: 0 }}>
                    <Chip
                      label={s.source}
                      size="small"
                      variant="outlined"
                      color={s.source === "custom" ? "primary" : "default"}
                    />
                    <IconButton size="small" color="error" onClick={() => handleDelete(s.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <AddSentenceDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={fetchSentences} />
    </Box>
  );
}

function AddSentenceDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [japanese, setJapanese] = useState("");
  const [english, setEnglish] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setJapanese(""); setEnglish(""); }
  }, [open]);

  async function handleSave() {
    if (!japanese.trim() || !english.trim()) return;
    setSaving(true);
    await fetch("/api/sentences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ japanese: japanese.trim(), english: english.trim() }),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Add sentence
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack gap={2} pt={0.5}>
          <TextField
            label="Japanese"
            value={japanese}
            onChange={(e) => setJapanese(e.target.value)}
            fullWidth
            multiline
            rows={2}
            inputProps={{ lang: "ja" }}
            autoFocus
          />
          <TextField
            label="English"
            value={english}
            onChange={(e) => setEnglish(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !japanese.trim() || !english.trim()}>
          {saving ? "Saving…" : "Add sentence"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
