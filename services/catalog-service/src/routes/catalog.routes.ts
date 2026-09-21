import { Router } from 'express';
import {
  getMovies,
  getMovieById,
  getTheaters,
  getShows,
  getShowDetails,
  createMovie,
  createShow,
  healthCheck,
} from '../controllers/catalog.controller';

const router = Router();

// Public Catalog Browsing Endpoints
router.get('/movies', getMovies);
router.get('/movies/:id', getMovieById);
router.get('/theaters', getTheaters);
router.get('/shows', getShows);
router.get('/shows/:id', getShowDetails);
router.get('/health', healthCheck);

// Admin Management Endpoints
router.post('/movies', createMovie);
router.post('/shows', createShow);

export default router;
