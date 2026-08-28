import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import * as notes from '../services/notes.service.js';
import { recordRecent } from '../services/activity.service.js';

const router = Router();
router.use(requireAuth);
router.get('/', asyncHandler(async (req, res) => { res.json({ notes: notes.listNotes(req.user.id) }); }));
router.get('/search', asyncHandler(async (req, res) => { res.json({ results: notes.searchNotes(req.user.id, req.query.q || '') }); }));
router.get('/:id', asyncHandler(async (req, res) => {
  const note = notes.getNote(req.user.id, req.params.id);
  recordRecent(req.user.id, { kind: 'note', ref: note.id, title: note.title, path: note.path });
  res.json(note);
}));
router.post('/', asyncHandler(async (req, res) => { res.status(201).json(notes.createNote(req.user.id, req.body || {})); }));
router.patch('/:id', asyncHandler(async (req, res) => { res.json(notes.updateNote(req.user.id, req.params.id, req.body || {})); }));
router.delete('/:id', asyncHandler(async (req, res) => { res.json(notes.deleteNote(req.user.id, req.params.id, { trashFile: Boolean(req.query.trash) })); }));
export default router;
