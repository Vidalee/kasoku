"use client";
import { useState, useEffect } from "react";
import {
  Box, Typography, Button, Card, CardContent, Stack, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Chip, CircularProgress,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import FolderIcon from "@mui/icons-material/Folder";
import CloseIcon from "@mui/icons-material/Close";

const PRESET_COLORS = ["#6750A4","#B3261E","#006A6B","#1a6b3c","#B45309","#1565C0","#6D3A9C","#2E7D32"];

interface Deck { id: string; name: string; color: string; wordCount: number; }

export default function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Deck | null>(null);

  async function fetchDecks() {
    const res = await fetch("/api/decks");
    const data = await res.json();
    setDecks(data.decks ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchDecks(); }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this deck? Words won't be deleted.")) return;
    await fetch(`/api/decks/${id}`, { method: "DELETE" });
    fetchDecks();
  }

  if (loading) return <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h5" fontWeight={700}>Decks</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setDialogOpen(true); }}>
          New deck
        </Button>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 2 }}>
        {decks.map((deck) => (
          <Card key={deck.id} variant="outlined" sx={{ borderLeft: `4px solid ${deck.color}` }}>
            <CardContent>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <FolderIcon sx={{ color: deck.color }} />
                  <Typography fontWeight={600}>{deck.name}</Typography>
                </Box>
                <Stack direction="row">
                  <IconButton size="small" onClick={() => { setEditing(deck); setDialogOpen(true); }}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(deck.id)}><DeleteIcon fontSize="small" /></IconButton>
                </Stack>
              </Stack>
              <Typography variant="body2" color="text.secondary" mt={1}>
                {deck.wordCount} word{deck.wordCount !== 1 ? "s" : ""}
              </Typography>
            </CardContent>
          </Card>
        ))}
        {decks.length === 0 && (
          <Typography color="text.secondary" sx={{ gridColumn: "1/-1", py: 4, textAlign: "center" }}>
            No decks yet. Create one to organize your vocabulary!
          </Typography>
        )}
      </Box>

      <DeckDialog
        open={dialogOpen}
        deck={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={fetchDecks}
      />
    </Box>
  );
}

function DeckDialog({ open, deck, onClose, onSaved }: { open: boolean; deck: Deck | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(deck?.name ?? "");
    setColor(deck?.color ?? PRESET_COLORS[0]);
  }, [deck, open]);

  async function handleSave() {
    setSaving(true);
    if (deck) {
      await fetch(`/api/decks/${deck.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, color }) });
    } else {
      await fetch("/api/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, color }) });
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {deck ? "Edit deck" : "New deck"}
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack gap={2}>
          <TextField autoFocus label="Deck name" value={name} onChange={(e) => setName(e.target.value)} fullWidth
            onKeyDown={(e) => e.key === "Enter" && name.trim() && handleSave()} />
          <Box>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">Color</Typography>
            <Stack direction="row" gap={1} flexWrap="wrap">
              {PRESET_COLORS.map((c) => (
                <Box key={c} onClick={() => setColor(c)} sx={{
                  width: 28, height: 28, borderRadius: "50%", bgcolor: c, cursor: "pointer",
                  border: color === c ? "3px solid white" : "3px solid transparent",
                  boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                }} />
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!name.trim() || saving}>
          {saving ? "Saving…" : deck ? "Save" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
