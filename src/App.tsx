import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, MapPin, Search, Sparkles, ChefHat, LocateFixed, Heart, Clock3, Phone, ExternalLink, AlertCircle, Users, MessageSquare, Plus, Trash2, Star, Send, Utensils, Navigation, BookOpen, MapPinned, ScrollText } from "lucide-react";
import './App.css'

const MEALDB_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_MEALDB_KEY) || "1";
const API_URL = ((typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "").replace(/\/+$/, "");
const DEFAULT_COORDS = { lat: 33.1843, lng: -96.8894, label: "Frisco, TX" };

interface Coords {
  lat: number;
  lng: number;
  label?: string;
}

interface Category {
  id?: string;
  name: string;
}

interface Chain {
  name: string;
}

interface Restaurant {
  id: string;
  name: string;
  categories: Category[];
  distanceMeters: number;
  distanceMiles: number;
  address: string;
  rating: number | null;
  price: number | null;
  description: string;
  phone: string;
  website: string;
  openStatus: string;
  chains: Chain[];
  tastes: string[];
  features: string[];
  popularity: number;
  lat: number;
  lon: number;
}

function getGoogleMapsUrl(restaurant: Restaurant): string {
  if (restaurant.lat && restaurant.lon) {
    return `https://www.google.com/maps/search/?api=1&query=${restaurant.lat},${restaurant.lon}&query_place_id=${encodeURIComponent(restaurant.name)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.name + (restaurant.address ? " " + restaurant.address : ""))}`;
}

function getMenuSearchUrl(restaurant: Restaurant): string {
  const query = `${restaurant.name}${restaurant.address ? " " + restaurant.address : ""} menu`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function getRestaurantLogoUrl(restaurant: Restaurant): string | null {
  if (restaurant.website) {
    try {
      const domain = new URL(restaurant.website).hostname;
      return `https://logo.clearbit.com/${domain}`;
    } catch { /* ignore */ }
  }
  return null;
}

interface RankedRestaurant extends Restaurant {
  matchScore: number;
}

interface Meal {
  id: string;
  name: string;
  image: string;
  category: string;
  area: string;
  tags: string[];
  source: string;
  youtube: string;
  instructions: string;
  ingredients: string[];
}

interface RecipeBundle {
  query: string;
  meals: Meal[];
}

const moodMap: Record<string, string[]> = {
  cozy: ["cozy", "comfort food", "intimate", "wine", "pasta", "bistro"],
  romantic: ["romantic", "fine dining", "wine bar", "date night", "bistro"],
  calm: ["quiet", "tea", "healthy", "sushi", "cafe"],
  fun: ["tacos", "burger", "brunch", "cocktails", "lively"],
  social: ["shareable", "family style", "barbecue", "pizza", "tapas"],
  energetic: ["fast casual", "spicy", "street food", "coffee"],
  healthy: ["salad", "poke", "sushi", "grill", "mediterranean"],
  adventurous: ["fusion", "thai", "indian", "korean", "chef special"],
  elegant: ["steakhouse", "french", "chef tasting", "seafood"],
  comfort: ["fried chicken", "mac and cheese", "barbecue", "diner", "southern"],
};

const occasionMap: Record<string, string[]> = {
  "date night": ["romantic", "wine", "steakhouse", "italian", "french"],
  anniversary: ["fine dining", "tasting", "french", "seafood", "steakhouse"],
  celebration: ["group dining", "steakhouse", "rooftop", "italian", "seafood"],
  "family dinner": ["pizza", "mexican", "american", "barbecue", "family style"],
  "quick bite": ["fast casual", "sandwich", "tacos", "burger", "cafe"],
  "solo meal": ["ramen", "poke", "cafe", "healthy", "sushi"],
  brunch: ["brunch", "bakery", "coffee", "american"],
  "try something new": ["fusion", "korean", "thai", "indian", "chef special"],
};

const cuisines = [
  "Any", "Italian", "Mexican", "Japanese", "American", "Indian", "French",
  "Thai", "Chinese", "Mediterranean", "Korean", "Seafood", "Steakhouse",
  "Pizza", "Sushi", "Cafe", "Barbecue",
];

const moods = Object.keys(moodMap);
const occasions = Object.keys(occasionMap);

function milesFromMeters(meters: number) {
  return Number((meters / 1609.34).toFixed(1));
}

function titleCase(value: string) {
  return value
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// --- Comment types and API helpers ---

interface Comment {
  id: string;
  restaurantId: string;
  author: string;
  text: string;
  rating: number;
  timestamp: number;
}

interface ApiComment {
  id: string;
  restaurant_id: string;
  author: string;
  text: string;
  rating: number;
  timestamp: number;
}

function apiCommentToComment(ac: ApiComment): Comment {
  return {
    id: ac.id,
    restaurantId: ac.restaurant_id,
    author: ac.author,
    text: ac.text,
    rating: ac.rating,
    timestamp: ac.timestamp * 1000,
  };
}

async function loadCommentsFromApi(restaurantId: string): Promise<Comment[]> {
  try {
    const res = await fetch(`${API_URL}/api/comments/${encodeURIComponent(restaurantId)}`);
    if (!res.ok) throw new Error("API error");
    const data: ApiComment[] = await res.json();
    return data.map(apiCommentToComment);
  } catch {
    return loadCommentsLocal(restaurantId);
  }
}

async function saveCommentToApi(restaurantId: string, author: string, text: string, rating: number): Promise<Comment | null> {
  try {
    const res = await fetch(`${API_URL}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurant_id: restaurantId, author: author.trim(), text: text.trim(), rating }),
    });
    if (!res.ok) throw new Error("API error");
    const data: ApiComment = await res.json();
    return apiCommentToComment(data);
  } catch {
    const comment: Comment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      restaurantId,
      author: author.trim(),
      text: text.trim(),
      rating,
      timestamp: Date.now(),
    };
    saveCommentLocal(comment);
    return comment;
  }
}

async function deleteCommentFromApi(commentId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
    return res.ok;
  } catch {
    deleteCommentLocal(commentId);
    return true;
  }
}

// --- localStorage fallback helpers ---

function loadCommentsLocal(restaurantId: string): Comment[] {
  try {
    const all = JSON.parse(localStorage.getItem("rmf_comments") || "{}");
    return (all[restaurantId] || []) as Comment[];
  } catch {
    return [];
  }
}

function saveCommentLocal(comment: Comment) {
  try {
    const all = JSON.parse(localStorage.getItem("rmf_comments") || "{}");
    if (!all[comment.restaurantId]) all[comment.restaurantId] = [];
    all[comment.restaurantId].push(comment);
    localStorage.setItem("rmf_comments", JSON.stringify(all));
  } catch { /* ignore */ }
}

function deleteCommentLocal(commentId: string) {
  try {
    const all = JSON.parse(localStorage.getItem("rmf_comments") || "{}");
    for (const key of Object.keys(all)) {
      all[key] = (all[key] as Comment[]).filter((c) => c.id !== commentId);
    }
    localStorage.setItem("rmf_comments", JSON.stringify(all));
  } catch { /* ignore */ }
}

// --- Group Mode types ---

interface GroupMember {
  id: string;
  name: string;
  mood: string;
  occasion: string;
  cuisine: string;
}

function scoreGroupConsensus(place: Restaurant, members: GroupMember[], maxDistance: number): number {
  if (!members.length) return 0;
  let total = 0;
  for (const member of members) {
    total += scorePlace(place, member.mood, member.occasion, member.cuisine, maxDistance, "");
  }
  return Number((total / members.length).toFixed(1));
}

function inferDishKeywords(place: Restaurant) {
  const labels = (place.categories || []).flatMap((category) => category.name ? [category.name.toLowerCase()] : []);
  const text = [place.name, ...(place.tastes || []), ...(place.features || []), ...labels]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const dishRules = [
    { match: ["pizza", "italian"], query: "margherita pizza" },
    { match: ["sushi", "japanese"], query: "sushi" },
    { match: ["ramen"], query: "ramen" },
    { match: ["steak", "steakhouse"], query: "steak" },
    { match: ["seafood"], query: "grilled salmon" },
    { match: ["mexican", "taco"], query: "tacos" },
    { match: ["burger"], query: "burger" },
    { match: ["barbecue", "bbq"], query: "barbecue ribs" },
    { match: ["indian"], query: "butter chicken" },
    { match: ["thai"], query: "pad thai" },
    { match: ["korean"], query: "bulgogi" },
    { match: ["mediterranean"], query: "chicken shawarma" },
    { match: ["french"], query: "coq au vin" },
    { match: ["cafe", "bakery", "brunch"], query: "french toast" },
  ];

  for (const rule of dishRules) {
    if (rule.match.some((item) => text.includes(item))) return rule.query;
  }

  return (place.categories?.[0]?.name || place.name || "restaurant recipe").toLowerCase();
}

function getCuisineMatch(place: Restaurant, selectedCuisine: string) {
  if (selectedCuisine === "Any") return true;
  const searchable = [
    place.name,
    ...(place.categories || []).map((category) => category.name),
    ...(place.chains || []).map((chain) => chain.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(selectedCuisine.toLowerCase());
}

function scorePlace(place: RankedRestaurant | Restaurant, selectedMood: string, selectedOccasion: string, selectedCuisine: string, maxDistance: number, queryText: string) {
  let score = 0;
  const searchBlob = [
    place.name,
    place.description,
    ...(place.categories || []).map((category) => category.name),
    ...(place.tastes || []),
    ...(place.features || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const moodTerms = moodMap[selectedMood] || [];
  const occasionTerms = occasionMap[selectedOccasion] || [];

  score += moodTerms.reduce((sum, term) => sum + (searchBlob.includes(term) ? 2 : 0), 0);
  score += occasionTerms.reduce((sum, term) => sum + (searchBlob.includes(term) ? 2 : 0), 0);

  if (selectedCuisine !== "Any" && getCuisineMatch(place, selectedCuisine)) score += 5;
  if (place.distanceMiles <= maxDistance) score += Math.max(1, 6 - place.distanceMiles / 1.5);
  if (queryText && searchBlob.includes(queryText.toLowerCase())) score += 3;
  if (place.rating) score += Math.min(4, place.rating / 2.5);
  if (place.popularity) score += Math.min(3, place.popularity / 20);

  return Number(score.toFixed(1));
}

async function reverseGeocode(lat: number, lng: number) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) throw new Error("Unable to resolve location name.");
  const data = await response.json();
  const address = data.address || {};
  return [address.city, address.town, address.village, address.county, address.state]
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
}

async function geocodeTextLocation(input: string) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(input)}`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) throw new Error("Unable to search that location.");
  const results = await response.json();
  if (!results?.length) throw new Error("No matching place found.");

  const first = results[0];
  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    label: first.display_name,
  };
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function mapCuisineToOverpassFilter(cuisine: string): string {
  const cuisineMap: Record<string, string> = {
    Italian: "italian", Mexican: "mexican", Japanese: "japanese", American: "american",
    Indian: "indian", French: "french", Thai: "thai", Chinese: "chinese",
    Mediterranean: "mediterranean", Korean: "korean", Seafood: "seafood",
    Steakhouse: "steak", Pizza: "pizza", Sushi: "sushi;japanese", Cafe: "coffee",
    Barbecue: "barbecue",
  };
  return cuisineMap[cuisine] || "";
}

async function fetchNearbyRestaurants({ lat, lng, radiusMiles, selectedCuisine, queryText }: {
  lat: number; lng: number; radiusMiles: number; selectedCuisine: string; queryText: string;
}): Promise<Restaurant[]> {
  const radius = Math.round(radiusMiles * 1609.34);

  const cuisineFilter = selectedCuisine !== "Any" ? mapCuisineToOverpassFilter(selectedCuisine) : "";
  const cuisineQuery = cuisineFilter
    ? `["cuisine"~"${cuisineFilter}",i]`
    : "";

  const query = `[out:json][timeout:15];(node["amenity"~"restaurant|cafe|fast_food"]${cuisineQuery}(around:${radius},${lat},${lng}););out body qt 40;`;

  const servers = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  let response: Response | null = null;
  for (const server of servers) {
    try {
      response = await fetch(server, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (response.ok) break;
    } catch {
      continue;
    }
  }

  if (!response || !response.ok) {
    throw new Error("Restaurant search is temporarily unavailable. Please try again in a moment.");
  }

  const data = await response.json();
  const elements: OverpassElement[] = data.elements || [];

  const lowerQuery = (queryText || "").toLowerCase();

  const results: Restaurant[] = elements
    .filter((el) => el.tags?.name)
    .map((el) => {
      const tags = el.tags || {};
      const elLat = el.lat ?? el.center?.lat ?? 0;
      const elLon = el.lon ?? el.center?.lon ?? 0;
      const dist = haversineDistance(lat, lng, elLat, elLon);
      const cuisineTags = (tags.cuisine || "").split(";").map((c) => c.trim()).filter(Boolean);
      const amenity = tags.amenity || "restaurant";

      const categories: Category[] = [
        ...cuisineTags.map((c) => ({ name: titleCase(c) })),
      ];
      if (!categories.length) {
        categories.push({ name: titleCase(amenity) });
      }

      const addressParts = [
        tags["addr:housenumber"],
        tags["addr:street"],
        tags["addr:city"],
        tags["addr:state"],
      ].filter(Boolean);

      return {
        id: `${el.type}-${el.id}`,
        name: tags.name || "Unknown",
        categories,
        distanceMeters: Math.round(dist),
        distanceMiles: milesFromMeters(dist),
        address: addressParts.join(", ") || "",
        rating: null,
        price: null,
        description: cuisineTags.length ? `${cuisineTags.map((c) => titleCase(c)).join(", ")} cuisine` : "",
        phone: tags.phone || tags["contact:phone"] || "",
        website: tags.website || tags["contact:website"] || "",
        openStatus: tags.opening_hours || "",
        chains: [],
        tastes: cuisineTags,
        features: [amenity, tags.outdoor_seating === "yes" ? "outdoor seating" : ""].filter(Boolean),
        popularity: 0,
        lat: elLat,
        lon: elLon,
      };
    })
    .filter((r) => {
      if (!lowerQuery) return true;
      const blob = [r.name, r.description, ...r.tastes, ...r.categories.map((c) => c.name)]
        .join(" ")
        .toLowerCase();
      return blob.includes(lowerQuery);
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 30);

  return results;
}

async function fetchRecipesForPlace(place: Restaurant): Promise<RecipeBundle> {
  const dishQuery = inferDishKeywords(place);
  const url = `https://www.themealdb.com/api/json/v1/${MEALDB_KEY}/search.php?s=${encodeURIComponent(dishQuery)}`;
  const response = await fetch(url);

  if (!response.ok) throw new Error("Unable to load recipes.");
  const data = await response.json();
  const meals = data.meals || [];

  if (!meals.length) {
    return { query: dishQuery, meals: [] };
  }

  return {
    query: dishQuery,
    meals: meals.slice(0, 3).map((meal: Record<string, string>) => {
      const ingredients: string[] = [];
      for (let index = 1; index <= 20; index += 1) {
        const ingredient = meal[`strIngredient${index}`]?.trim();
        const measure = meal[`strMeasure${index}`]?.trim();
        if (ingredient) ingredients.push(`${measure ? `${measure} ` : ""}${ingredient}`.trim());
      }

      return {
        id: meal.idMeal,
        name: meal.strMeal,
        image: meal.strMealThumb,
        category: meal.strCategory,
        area: meal.strArea,
        tags: meal.strTags ? meal.strTags.split(",") : [],
        source: meal.strSource,
        youtube: meal.strYoutube,
        instructions: meal.strInstructions,
        ingredients,
      };
    }),
  };
}

// --- Comments Section Component ---

function CommentsSection({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    loadCommentsFromApi(restaurantId).then((c) => { setComments(c); setLoading(false); });
  }, [restaurantId]);

  async function handleSubmit() {
    if (!author.trim() || !text.trim()) return;
    const saved = await saveCommentToApi(restaurantId, author, text, rating);
    if (saved) {
      const refreshed = await loadCommentsFromApi(restaurantId);
      setComments(refreshed);
      setText("");
    }
  }

  async function handleDelete(commentId: string) {
    await deleteCommentFromApi(commentId);
    const refreshed = await loadCommentsFromApi(restaurantId);
    setComments(refreshed);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Reviews for {restaurantName}</h3>
        <Badge variant="secondary" className="rounded-full">{comments.length}</Badge>
      </div>

      <div className="rounded-3xl bg-slate-100 p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name"
            className="rounded-2xl"
          />
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className="p-0.5"
              >
                <Star
                  className={`h-5 w-5 transition ${star <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
                />
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Share your experience..."
            className="rounded-2xl flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <Button onClick={handleSubmit} className="rounded-2xl" disabled={!author.trim() || !text.trim()}>
            <Send className="h-4 w-4 mr-1" /> Post
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : comments.length > 0 ? (
        <div className="space-y-3">
          {comments
            .sort((a, b) => b.timestamp - a.timestamp)
            .map((comment) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{comment.author}</span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-3.5 w-3.5 ${star <= comment.rating ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(comment.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <button onClick={() => handleDelete(comment.id)} className="text-slate-400 hover:text-red-500 transition">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-sm text-slate-700 leading-6">{comment.text}</p>
              </motion.div>
            ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No reviews yet. Be the first to share your experience!</p>
      )}
    </div>
  );
}

// --- Group Mode Panel Component ---

function GroupModePanel({ onGroupScore }: { onGroupScore: (members: GroupMember[]) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [newName, setNewName] = useState("");

  function addMember() {
    if (!newName.trim()) return;
    const member: GroupMember = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: newName.trim(),
      mood: "cozy",
      occasion: "date night",
      cuisine: "Any",
    };
    const next = [...members, member];
    setMembers(next);
    setNewName("");
    onGroupScore(next);
  }

  function removeMember(id: string) {
    const next = members.filter((m) => m.id !== id);
    setMembers(next);
    onGroupScore(next);
  }

  function updateMember(id: string, field: keyof GroupMember, value: string) {
    const next = members.map((m) => (m.id === id ? { ...m, [field]: value } : m));
    setMembers(next);
    onGroupScore(next);
  }

  if (!enabled) {
    return (
      <Button onClick={() => setEnabled(true)} variant="outline" className="rounded-2xl gap-2">
        <Users className="h-4 w-4" /> Enable Group Mode
      </Button>
    );
  }

  return (
    <Card className="rounded-[28px] border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Users className="h-5 w-5" />
            Group Mode
          </CardTitle>
          <Button onClick={() => { setEnabled(false); setMembers([]); onGroupScore([]); }} variant="ghost" size="sm" className="rounded-2xl">
            Disable
          </Button>
        </div>
        <CardDescription>
          Each member picks their preferences. The app finds restaurants that best match everyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Member name"
            className="rounded-2xl"
            onKeyDown={(e) => e.key === "Enter" && addMember()}
          />
          <Button onClick={addMember} className="rounded-2xl" disabled={!newName.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        {members.length > 0 ? (
          <div className="space-y-3">
            {members.map((member) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-sm">{member.name}</span>
                  <button onClick={() => removeMember(member.id)} className="text-slate-400 hover:text-red-500 transition">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Mood</label>
                    <Select value={member.mood} onValueChange={(v) => updateMember(member.id, "mood", v)}>
                      <SelectTrigger className="rounded-xl h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {moods.map((mood) => (
                          <SelectItem key={mood} value={mood}>{titleCase(mood)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Occasion</label>
                    <Select value={member.occasion} onValueChange={(v) => updateMember(member.id, "occasion", v)}>
                      <SelectTrigger className="rounded-xl h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {occasions.map((occasion) => (
                          <SelectItem key={occasion} value={occasion}>{titleCase(occasion)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Cuisine</label>
                    <Select value={member.cuisine} onValueChange={(v) => updateMember(member.id, "cuisine", v)}>
                      <SelectTrigger className="rounded-xl h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {cuisines.map((cuisine) => (
                          <SelectItem key={cuisine} value={cuisine}>{cuisine}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </motion.div>
            ))}
            <div className="rounded-2xl bg-slate-100 p-3 text-sm text-slate-600">
              <strong>{members.length}</strong> member{members.length !== 1 ? "s" : ""} in group. Results are ranked by average group preference score.
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Add group members to get started. Each person picks their mood, occasion, and cuisine.</p>
        )}
      </CardContent>
    </Card>
  );
}

function RecipeCard({ recipe }: { recipe: Meal }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row">
        {recipe.image ? (
          <img
            src={recipe.image}
            alt={recipe.name}
            className="h-44 w-full rounded-2xl object-cover md:w-44"
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="text-lg font-semibold">{recipe.name}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {recipe.category ? <Badge variant="secondary" className="rounded-full">{recipe.category}</Badge> : null}
              {recipe.area ? <Badge variant="secondary" className="rounded-full">{recipe.area}</Badge> : null}
              {recipe.tags?.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="rounded-full">{tag}</Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ingredients</p>
            <div className="flex flex-wrap gap-2">
              {recipe.ingredients.slice(0, 10).map((item) => (
                <Badge key={item} variant="outline" className="rounded-full">{item}</Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Instructions</p>
            <p className="line-clamp-5 text-sm leading-6 text-slate-700">{recipe.instructions}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {recipe.source ? (
              <Button asChild variant="outline" className="rounded-2xl">
                <a href={recipe.source} target="_blank" rel="noreferrer">
                  Source <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            ) : null}
            {recipe.youtube ? (
              <Button asChild variant="outline" className="rounded-2xl">
                <a href={recipe.youtube} target="_blank" rel="noreferrer">
                  Video <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [selectedMood, setSelectedMood] = useState("cozy");
  const [selectedOccasion, setSelectedOccasion] = useState("date night");
  const [selectedCuisine, setSelectedCuisine] = useState("Any");
  const [distance, setDistance] = useState([5]);
  const [queryText, setQueryText] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [coords, setCoords] = useState<Coords>(DEFAULT_COORDS);
  const [locationLabel, setLocationLabel] = useState(DEFAULT_COORDS.label);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [recipeBundle, setRecipeBundle] = useState<RecipeBundle | null>(null);
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState("");
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [commentRefreshKey, setCommentRefreshKey] = useState(0);
  void commentRefreshKey;

  const isGroupMode = groupMembers.length > 0;

  const rankedRestaurants = useMemo(() => {
    return restaurants
      .filter((place) => place.distanceMiles <= distance[0])
      .filter((place) => {
        if (isGroupMode) {
          return groupMembers.some((m) => m.cuisine === "Any" || getCuisineMatch(place, m.cuisine));
        }
        return getCuisineMatch(place, selectedCuisine);
      })
      .map((place) => ({
        ...place,
        matchScore: isGroupMode
          ? scoreGroupConsensus(place, groupMembers, distance[0])
          : scorePlace(place, selectedMood, selectedOccasion, selectedCuisine, distance[0], queryText),
      }))
      .sort((a, b) => b.matchScore - a.matchScore || a.distanceMiles - b.distanceMiles);
  }, [restaurants, distance, selectedCuisine, selectedMood, selectedOccasion, queryText, groupMembers, isGroupMode]);

  const topPick = rankedRestaurants[0] || null;

  async function searchRestaurants(targetCoords: Coords = coords) {
    try {
      setLoadingRestaurants(true);
      setError("");

      const results = await fetchNearbyRestaurants({
        lat: targetCoords.lat,
        lng: targetCoords.lng,
        radiusMiles: distance[0],
        selectedCuisine,
        queryText: queryText.trim(),
      });

      setRestaurants(results);
      const first = results[0] || null;
      setSelectedRestaurant(first);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load restaurants.");
      setRestaurants([]);
      setSelectedRestaurant(null);
    } finally {
      setLoadingRestaurants(false);
    }
  }

  async function loadRecipes(place: Restaurant) {
    if (!place) return;
    try {
      setLoadingRecipes(true);
      setError("");
      const bundle = await fetchRecipesForPlace(place);
      setRecipeBundle(bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load recipes.");
      setRecipeBundle(null);
    } finally {
      setLoadingRecipes(false);
    }
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("This browser does not support geolocation.");
      return;
    }

    try {
      setLocationLoading(true);
      setError("");

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        });
      });

      const nextCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setCoords(nextCoords);

      try {
        const label = await reverseGeocode(nextCoords.lat, nextCoords.lng);
        setLocationLabel(label || `${nextCoords.lat.toFixed(4)}, ${nextCoords.lng.toFixed(4)}`);
      } catch {
        setLocationLabel(`${nextCoords.lat.toFixed(4)}, ${nextCoords.lng.toFixed(4)}`);
      }

      await searchRestaurants(nextCoords);
    } catch (err) {
      setError((err as GeolocationPositionError)?.message || "Location permission was denied or timed out.");
    } finally {
      setLocationLoading(false);
    }
  }

  async function applyTypedLocation() {
    if (!locationInput.trim()) return;
    try {
      setLocationLoading(true);
      setError("");
      const resolved = await geocodeTextLocation(locationInput.trim());
      setCoords({ lat: resolved.lat, lng: resolved.lng });
      setLocationLabel(resolved.label);
      await searchRestaurants({ lat: resolved.lat, lng: resolved.lng });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to search for that location.");
    } finally {
      setLocationLoading(false);
    }
  }

  useEffect(() => {
    searchRestaurants(DEFAULT_COORDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedRestaurant) loadRecipes(selectedRestaurant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRestaurant]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchRestaurants(coords);
    }, 350);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCuisine, selectedMood, selectedOccasion, distance[0]]);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky Navigation */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-pink-600">
              <Utensils className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">MoodBite</span>
          </div>
          <div className="hidden items-center gap-1 sm:flex">
            <Button variant="ghost" size="sm" className="rounded-full text-slate-600" onClick={() => scrollToSection("search")}>
              <Search className="mr-1.5 h-4 w-4" /> Search
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full text-slate-600" onClick={() => scrollToSection("restaurants")}>
              <Navigation className="mr-1.5 h-4 w-4" /> Restaurants
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full text-slate-600" onClick={() => scrollToSection("recipes")}>
              <BookOpen className="mr-1.5 h-4 w-4" /> Recipes
            </Button>
            {selectedRestaurant && (
              <Button variant="ghost" size="sm" className="rounded-full text-slate-600" onClick={() => scrollToSection("reviews")}>
                <MessageSquare className="mr-1.5 h-4 w-4" /> Reviews
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={useCurrentLocation} disabled={locationLoading}>
            {locationLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-1.5 h-4 w-4" />}
            <span className="hidden sm:inline">{locationLabel}</span>
            <span className="sm:hidden">Locate</span>
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-pink-50 to-purple-50">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, rgba(251, 146, 60, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(168, 85, 247, 0.12) 0%, transparent 50%)" }} />
        <div className="relative mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-sm font-medium text-orange-700 shadow-sm backdrop-blur">
              <Sparkles className="h-4 w-4" /> Discover restaurants by mood
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl lg:text-6xl">
              Find your next <span className="bg-gradient-to-r from-orange-500 to-pink-600 bg-clip-text text-transparent">craving</span> on the map.
            </h1>
            <p className="mt-4 text-lg text-slate-600 md:text-xl">
              Tell us your mood, occasion & cuisine preference. We'll find the best nearby restaurants and inspire you with matching recipes.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Search Filters Section */}
      <section id="search" className="border-b border-slate-100 bg-slate-50/50">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mood</label>
                <Select value={selectedMood} onValueChange={setSelectedMood}>
                  <SelectTrigger className="rounded-xl border-slate-200 bg-white shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {moods.map((mood) => (
                      <SelectItem key={mood} value={mood}>{titleCase(mood)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Occasion</label>
                <Select value={selectedOccasion} onValueChange={setSelectedOccasion}>
                  <SelectTrigger className="rounded-xl border-slate-200 bg-white shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {occasions.map((occasion) => (
                      <SelectItem key={occasion} value={occasion}>{titleCase(occasion)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cuisine</label>
                <Select value={selectedCuisine} onValueChange={setSelectedCuisine}>
                  <SelectTrigger className="rounded-xl border-slate-200 bg-white shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cuisines.map((cuisine) => (
                      <SelectItem key={cuisine} value={cuisine}>{cuisine}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Keyword</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="tacos, ramen..." className="rounded-xl border-slate-200 bg-white pl-9 shadow-sm" />
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Search radius</label>
                  <span className="text-sm font-semibold text-orange-600">{distance[0]} mi</span>
                </div>
                <Slider value={distance} onValueChange={setDistance} min={1} max={15} step={1} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Input value={locationInput} onChange={(event) => setLocationInput(event.target.value)} placeholder="City or address" className="w-48 rounded-xl border-slate-200 bg-white shadow-sm" onKeyDown={(e) => e.key === "Enter" && applyTypedLocation()} />
                <Button onClick={applyTypedLocation} className="rounded-xl bg-gradient-to-r from-orange-500 to-pink-600 shadow-sm hover:from-orange-600 hover:to-pink-700" disabled={locationLoading}>
                  {locationLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
                  Search
                </Button>
                <Button onClick={() => searchRestaurants(coords)} variant="outline" className="rounded-xl shadow-sm" disabled={loadingRestaurants}>
                  {loadingRestaurants ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Refresh
                </Button>
              </div>
            </div>

            {isGroupMode && (
              <Alert className="mt-4 rounded-xl border-blue-200 bg-blue-50">
                <Users className="h-4 w-4" />
                <AlertTitle>Group Mode Active</AlertTitle>
                <AlertDescription>Results ranked by average preference across {groupMembers.length} member{groupMembers.length !== 1 ? "s" : ""}.</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert className="mt-4 rounded-xl border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Oops!</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </motion.div>
        </div>
      </section>

      {/* Top Pick Banner */}
      {topPick && !loadingRestaurants && (
        <section className="border-b border-slate-100 bg-gradient-to-r from-orange-500 to-pink-600">
          <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4 text-white">
                {(() => {
                  const logoUrl = getRestaurantLogoUrl(topPick);
                  return logoUrl ? (
                    <img src={logoUrl} alt={topPick.name} className="h-14 w-14 rounded-xl bg-white/20 object-contain p-1 shadow-lg" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-lg">
                      <Utensils className="h-7 w-7 text-white" />
                    </div>
                  );
                })()}
                <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-medium text-white/80">
                  <Heart className="h-4 w-4" /> Top pick for you
                </div>
                <h2 className="text-2xl font-bold md:text-3xl">{topPick.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/90">
                  {topPick.categories?.slice(0, 2).map((c) => (
                    <span key={c.name} className="rounded-full bg-white/20 px-3 py-0.5">{c.name}</span>
                  ))}
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {topPick.distanceMiles} mi</span>
                  <span className="rounded-full bg-white/20 px-3 py-0.5 font-semibold">Score {topPick.matchScore}</span>
                </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary" className="rounded-xl font-semibold">
                  <a href={getGoogleMapsUrl(topPick)} target="_blank" rel="noreferrer"><MapPinned className="mr-1.5 h-4 w-4" /> Directions</a>
                </Button>
                <Button asChild variant="secondary" className="rounded-xl">
                  <a href={getMenuSearchUrl(topPick)} target="_blank" rel="noreferrer"><ScrollText className="mr-1.5 h-4 w-4" /> Menu</a>
                </Button>
                {topPick.phone && (
                  <Button asChild variant="secondary" className="rounded-xl">
                    <a href={`tel:${topPick.phone}`}><Phone className="mr-1.5 h-4 w-4" /> Call</a>
                  </Button>
                )}
                <Button variant="secondary" className="rounded-xl font-semibold" onClick={() => { setSelectedRestaurant(topPick); scrollToSection("recipes"); }}>
                  <BookOpen className="mr-1.5 h-4 w-4" /> View Recipes
                </Button>
              </div>
            </motion.div>

            {(topPick.address || topPick.openStatus) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {topPick.address && (
                  <div className="rounded-xl bg-white/10 p-3 text-white backdrop-blur">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-white/70"><MapPin className="h-3.5 w-3.5" /> Address</div>
                    <p className="text-sm">{topPick.address}</p>
                  </div>
                )}
                {topPick.openStatus && (
                  <div className="rounded-xl bg-white/10 p-3 text-white backdrop-blur">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-white/70"><Clock3 className="h-3.5 w-3.5" /> Hours</div>
                    <p className="text-sm">{topPick.openStatus}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {loadingRestaurants && (
        <section className="border-b border-slate-100 bg-slate-50">
          <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-12 md:px-8">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            <span className="ml-3 text-lg text-slate-500">Searching nearby restaurants...</span>
          </div>
        </section>
      )}

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">

          {/* Restaurant Results */}
          <section id="restaurants" className="section-fade-in">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Nearby Restaurants</h2>
                <p className="mt-1 text-sm text-slate-500">{rankedRestaurants.length} results near {locationLabel}</p>
              </div>
            </div>
            <div className="space-y-3">
              {rankedRestaurants.length ? (
                rankedRestaurants.map((restaurant, index) => (
                  <motion.div
                    key={restaurant.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => setSelectedRestaurant(restaurant)}
                    className={`restaurant-card-hover cursor-pointer rounded-2xl border-2 p-4 transition-all ${selectedRestaurant?.id === restaurant.id ? "border-orange-500 bg-orange-50/50 shadow-md" : "border-slate-100 bg-white hover:border-slate-200"}`}
                  >
                    <div className="flex items-start gap-3">
                      {(() => {
                        const logoUrl = getRestaurantLogoUrl(restaurant);
                        return logoUrl ? (
                          <img src={logoUrl} alt={restaurant.name} className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 object-contain p-0.5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-100 to-pink-100">
                            <Utensils className="h-5 w-5 text-orange-500" />
                          </div>
                        );
                      })()}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold">{restaurant.name}</h3>
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-pink-600 px-2 text-xs font-bold text-white">{restaurant.matchScore}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{restaurant.categories?.map((c) => c.name).slice(0, 3).join(" \u2022 ") || "Restaurant"}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {restaurant.distanceMiles} mi</span>
                          {restaurant.rating && <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {restaurant.rating}</span>}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button asChild variant="outline" size="sm" className="h-7 rounded-lg text-xs" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <a href={getGoogleMapsUrl(restaurant)} target="_blank" rel="noreferrer"><MapPinned className="mr-1 h-3 w-3" /> Directions</a>
                          </Button>
                          <Button asChild variant="outline" size="sm" className="h-7 rounded-lg text-xs" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <a href={getMenuSearchUrl(restaurant)} target="_blank" rel="noreferrer"><ScrollText className="mr-1 h-3 w-3" /> Menu</a>
                          </Button>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5">
                        <Button size="sm" className="h-8 rounded-lg bg-gradient-to-r from-orange-500 to-pink-600 text-xs hover:from-orange-600 hover:to-pink-700" onClick={(e) => { e.stopPropagation(); setSelectedRestaurant(restaurant); scrollToSection("recipes"); }}>
                          Recipes
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : !loadingRestaurants ? (
                <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-400">
                  <Utensils className="mx-auto mb-3 h-8 w-8" />
                  <p className="font-medium">No restaurants found</p>
                  <p className="mt-1 text-sm">Try a different cuisine, radius, or location.</p>
                </div>
              ) : null}
            </div>
          </section>

          {/* Recipes Section */}
          <section id="recipes" className="section-fade-in">
            <div className="mb-5">
              <h2 className="text-2xl font-bold tracking-tight">Recipe Inspiration</h2>
              <p className="mt-1 text-sm text-slate-500">Dishes inspired by your selected restaurant</p>
            </div>
            {selectedRestaurant ? (
              <div className="space-y-4">
                <div className="rounded-2xl border-2 border-orange-100 bg-gradient-to-r from-orange-50 to-pink-50 p-4">
                  <div className="flex items-start gap-3">
                    {(() => {
                      const logoUrl = getRestaurantLogoUrl(selectedRestaurant);
                      return logoUrl ? (
                        <img src={logoUrl} alt={selectedRestaurant.name} className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain p-1 shadow-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-pink-500 shadow-sm">
                          <Utensils className="h-6 w-6 text-white" />
                        </div>
                      );
                    })()}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">Selected</p>
                      <h3 className="mt-1 text-lg font-bold">{selectedRestaurant.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Searching for: <span className="font-medium text-slate-700">{recipeBundle?.query || inferDishKeywords(selectedRestaurant)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-xs">
                      <a href={getGoogleMapsUrl(selectedRestaurant)} target="_blank" rel="noreferrer"><MapPinned className="mr-1.5 h-3.5 w-3.5" /> Directions</a>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-xs">
                      <a href={getMenuSearchUrl(selectedRestaurant)} target="_blank" rel="noreferrer"><ScrollText className="mr-1.5 h-3.5 w-3.5" /> Menu</a>
                    </Button>
                    {selectedRestaurant.phone && (
                      <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-xs">
                        <a href={`tel:${selectedRestaurant.phone}`}><Phone className="mr-1.5 h-3.5 w-3.5" /> Call</a>
                      </Button>
                    )}
                  </div>
                </div>

                {loadingRecipes ? (
                  <div className="flex min-h-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-200">
                    <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                  </div>
                ) : recipeBundle?.meals?.length ? (
                  <div className="space-y-4">
                    {recipeBundle.meals.map((recipe) => (
                      <RecipeCard key={recipe.id} recipe={recipe} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-400">
                    <ChefHat className="mx-auto mb-3 h-8 w-8" />
                    <p className="font-medium">No recipes found</p>
                    <p className="mt-1 text-sm">Try selecting a different restaurant.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-400">
                <BookOpen className="mx-auto mb-3 h-8 w-8" />
                <p className="font-medium">Select a restaurant</p>
                <p className="mt-1 text-sm">Click on a restaurant to see recipe inspiration.</p>
              </div>
            )}
          </section>
        </div>

        {/* Group Mode */}
        <div className="mt-8">
          <GroupModePanel onGroupScore={(members) => { setGroupMembers(members); setCommentRefreshKey((k) => k + 1); }} />
        </div>

        {/* Reviews Section */}
        {selectedRestaurant && (
          <section id="reviews" className="mt-8 section-fade-in">
            <Card className="rounded-2xl border-2 border-slate-100 shadow-sm">
              <CardContent className="pt-6">
                <CommentsSection restaurantId={selectedRestaurant.id} restaurantName={selectedRestaurant.name} />
              </CardContent>
            </Card>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row md:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-pink-600">
              <Utensils className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold">MoodBite</span>
          </div>
          <p className="text-sm text-slate-400">Discover restaurants, get inspired, share reviews.</p>
        </div>
      </footer>
    </div>
  );
}

export default App
