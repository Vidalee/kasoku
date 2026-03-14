"use client";
import { useState, useEffect } from "react";
import {
  Box, Typography, Button, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Chip, MenuItem, Select, InputLabel, FormControl,
  CircularProgress, List, ListItemButton, ListItemText, Divider, Stack, Tooltip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

export interface Word {
  id: string;
  kanji: string;
  furigana: string;
  meaning: string;
  jlptLevel: number | null;
  tags: string[];
}

export interface Deck {
  id: string;
  name: string;
  color: string;
}

export interface JishoResult {
  kanji: string;
  furigana: string;
  meaning: string;
  jlptLevel: number | null;
  partOfSpeech: string[];
}

const JLPT_LEVELS = [5, 4, 3, 2, 1];

interface WordDialogProps {
  open: boolean;
  word?: Word | null;
  decks: Deck[];
  onClose: () => void;
  onSaved: () => void;
  /** Pre-fill the form (skips lookup step). Used when clicking a token in the analyze page. */
  prefill?: { kanji: string; furigana: string; meaning: string; jlptLevel: number | null } | null;
}

export function WordDialog({ open, word, decks, onClose, onSaved, prefill }: WordDialogProps) {
  const [tab, setTab] = useState<"lookup" | "manual">("lookup");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JishoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState({ kanji: "", furigana: "", meaning: "", jlptLevel: "", tags: "" });
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (word) {
      setForm({ kanji: word.kanji, furigana: word.furigana, meaning: word.meaning, jlptLevel: word.jlptLevel ? String(word.jlptLevel) : "", tags: word.tags.join(", ") });
      setTab("manual");
      fetch(`/api/words/${word.id}`).then((r) => r.json()).then((d) => setSelectedDeckIds(d.deckIds ?? []));
    } else if (prefill) {
      setForm({ kanji: prefill.kanji, furigana: prefill.furigana, meaning: prefill.meaning, jlptLevel: prefill.jlptLevel ? String(prefill.jlptLevel) : "", tags: "" });
      setSelectedDeckIds([]);
      setTab("manual");
    } else {
      setForm({ kanji: "", furigana: "", meaning: "", jlptLevel: "", tags: "" });
      setSelectedDeckIds([]);
      setTab("lookup");
    }
    setQuery(""); setResults([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleLookup() {
    if (!query.trim()) return;
    setSearching(true);
    const res = await fetch(`/api/jmdict?q=${encodeURIComponent(query)}`);
    setResults((await res.json()).results ?? []);
    setSearching(false);
  }

  function pickResult(r: JishoResult) {
    setForm({ kanji: r.kanji, furigana: r.furigana, meaning: r.meaning, jlptLevel: r.jlptLevel ? String(r.jlptLevel) : "", tags: "" });
    setTab("manual");
  }

  function toggleDeck(id: string) {
    setSelectedDeckIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  async function handleSave() {
    setSaving(true);
    const body = {
      kanji: form.kanji, furigana: form.furigana, meaning: form.meaning,
      jlptLevel: form.jlptLevel ? parseInt(form.jlptLevel) : null,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      deckIds: selectedDeckIds,
    };
    if (word) {
      await fetch(`/api/words/${word.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/words", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  const canSave = form.kanji && form.furigana && form.meaning;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {word ? "Edit word" : "Add word"}
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {tab === "lookup" && !word && (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Search the dictionary, or{" "}
              <Button size="small" onClick={() => setTab("manual")} sx={{ p: 0, minWidth: 0, textTransform: "none" }}>enter manually</Button>
            </Typography>
            <Stack direction="row" gap={1}>
              <TextField fullWidth autoFocus placeholder="食べる, taberu, to eat…" value={query}
                onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLookup()} size="small" />
              <Button variant="outlined" onClick={handleLookup} disabled={searching}>
                {searching ? <CircularProgress size={18} /> : "Search"}
              </Button>
            </Stack>
            {results.length > 0 && (
              <List dense sx={{ mt: 1 }}>
                {results.map((r, i) => (
                  <Box key={i}>
                    <ListItemButton onClick={() => pickResult(r)}>
                      <ListItemText
                        primary={<Stack direction="row" gap={1} alignItems="baseline">
                          <Typography fontWeight={700} lang="ja">{r.kanji || r.furigana}</Typography>
                          <Typography variant="body2" color="text.secondary" lang="ja">{r.kanji ? r.furigana : ""}</Typography>
                          {r.jlptLevel && <Chip label={`N${r.jlptLevel}`} size="small" />}
                        </Stack>}
                        secondary={r.meaning}
                      />
                    </ListItemButton>
                    {i < results.length - 1 && <Divider />}
                  </Box>
                ))}
              </List>
            )}
          </Box>
        )}

        {(tab === "manual" || word) && (
          <Stack gap={2}>
            <Stack direction="row" gap={2}>
              <TextField label="Kanji / Word" value={form.kanji} onChange={(e) => setForm((f) => ({ ...f, kanji: e.target.value }))} fullWidth inputProps={{ lang: "ja" }} autoFocus={!word} />
              <TextField label="Furigana" value={form.furigana} onChange={(e) => setForm((f) => ({ ...f, furigana: e.target.value }))} fullWidth inputProps={{ lang: "ja" }} />
            </Stack>
            <TextField label="Meaning" value={form.meaning} onChange={(e) => setForm((f) => ({ ...f, meaning: e.target.value }))} fullWidth multiline rows={2} />
            <Stack direction="row" gap={2}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>JLPT</InputLabel>
                <Select value={form.jlptLevel} label="JLPT" onChange={(e) => setForm((f) => ({ ...f, jlptLevel: e.target.value as string }))}>
                  <MenuItem value="">—</MenuItem>
                  {JLPT_LEVELS.map((l) => <MenuItem key={l} value={l}>N{l}</MenuItem>)}
                </Select>
              </FormControl>
              <Tooltip title="Comma-separated tags">
                <TextField label="Tags" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="food, travel" size="small" fullWidth />
              </Tooltip>
            </Stack>
            {decks.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Decks</Typography>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  {decks.map((d) => (
                    <Chip key={d.id} label={d.name} size="small"
                      onClick={() => toggleDeck(d.id)}
                      color={selectedDeckIds.includes(d.id) ? "primary" : "default"}
                      variant={selectedDeckIds.includes(d.id) ? "filled" : "outlined"}
                      sx={{ borderColor: d.color, ...(selectedDeckIds.includes(d.id) ? { bgcolor: d.color } : {}) }}
                    />
                  ))}
                </Stack>
              </Box>
            )}
            {!word && !prefill && <Button variant="text" size="small" onClick={() => setTab("lookup")} sx={{ alignSelf: "flex-start" }}>← Back to lookup</Button>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        {tab === "lookup" && !word && <Button variant="outlined" onClick={() => setTab("manual")}>Manual entry</Button>}
        {(tab === "manual" || word) && (
          <Button variant="contained" onClick={handleSave} disabled={saving || !canSave}>
            {saving ? "Saving…" : word ? "Save changes" : "Add to vocabulary"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
