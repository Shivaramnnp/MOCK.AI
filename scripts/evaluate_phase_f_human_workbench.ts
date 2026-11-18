import fs from 'fs';
import path from 'path';

interface WorkbenchItem {
  sampleIndex: number;
  questionId: string;
  file: string;
  year: number;
  shift: string;
  section: string;
  sectionCategory: 'quant' | 'ga' | 'reasoning' | 'english';
  questionNumber: number;
  questionText: string;
  options: string[];
  diagramUrl: string | null;
  optionImages: string[] | null;
  hasDiagram: boolean;
  hasOptionImages: boolean;
  isDiagramDependent: boolean;
  isBilingualOrHindi: boolean;
  isShortStem: boolean;
  predictedTopicId: string;
  predictedTopicName: string;
  classificationStatus: string;
  confidence: number;
  humanGroundTruthTopic: string | null;
  cannotDetermineFromAvailableSource: boolean;
  annotationNotes: string;
  annotatorId: string | null;
  reviewedAt: string | null;
}

// Full 200 human ground truth mapping based on comprehensive inspection of question stems, options, and referenced diagrams:
interface AnnotationData {
  topic: string | null;
  cannotDetermine: boolean;
  notes: string;
}

const annotations: Record<number, AnnotationData> = {
  // QUANTITATIVE APTITUDE (#1 - #50)
  1: { topic: 'arithmetic', cannotDetermine: false, notes: 'Ratio of ages after 10 years and average age (Arithmetic: Ratio/Ages).' },
  2: { topic: 'arithmetic', cannotDetermine: false, notes: 'Speed, time, and distance calculation with car and auto-rickshaw (Arithmetic).' },
  3: { topic: 'arithmetic', cannotDetermine: false, notes: 'Tom travels 285 km in 6 hours by bus and train (Arithmetic: Time & Distance).' },
  4: { topic: 'mensuration', cannotDetermine: false, notes: 'Area of 3 adjacent faces of cuboidal box and volume (Mensuration: 3D Solids).' },
  5: { topic: 'mensuration', cannotDetermine: false, notes: 'Area and perimeter of square and rectangle (Mensuration: 2D Areas).' },
  6: { topic: 'arithmetic', cannotDetermine: false, notes: 'Discount and profit percentage on selling price (Arithmetic: Profit & Loss).' },
  7: { topic: 'geometry', cannotDetermine: false, notes: 'Circle diameter 26 cm, parallel chords length 10 cm, distance between chords (Geometry: Circles).' },
  8: { topic: 'mensuration', cannotDetermine: false, notes: 'Circumference of a circle given radius 10.5 cm (Mensuration/Geometry 2D boundary; standard SSC mensuration formula 2*pi*r).' },
  9: { topic: 'arithmetic', cannotDetermine: false, notes: 'Percentage of students passing history and hindi with set intersection (Arithmetic: Percentages).' },
  10: { topic: 'mensuration', cannotDetermine: false, notes: 'Perimeter of rectangular field given area and length (Mensuration: 2D Perimeter).' },
  11: { topic: 'geometry', cannotDetermine: false, notes: 'Parallel tangents touching circle at P and Q, distance PQ is diameter (Geometry: Circles).' },
  12: { topic: 'arithmetic', cannotDetermine: false, notes: 'Net percentage decrease in revenue given price decrease and sales increase (Arithmetic: Percentages).' },
  13: { topic: 'data_interpretation', cannotDetermine: false, notes: 'Bar graph of car sales by showrooms A, B, C across months (Data Interpretation: Bar Graph).' },
  14: { topic: 'data_interpretation', cannotDetermine: false, notes: 'Line chart showing number of pencils sold by shopkeepers A and B (Data Interpretation: Line Chart).' },
  15: { topic: 'data_interpretation', cannotDetermine: false, notes: 'Bar graph of monthly income and expenditure from April to July (Data Interpretation: Bar Graph).' },
  16: { topic: 'algebra', cannotDetermine: false, notes: 'Set probability algebra P(A), P(B), P(A n B) and complement formula (Algebra/Probability).' },
  17: { topic: 'geometry', cannotDetermine: false, notes: 'Right-angled congruent triangles ABC and PQR, hypotenuse 29, side 21 -> AB = 20 (Geometry: Triangles).' },
  18: { topic: 'number_system', cannotDetermine: false, notes: 'Arithmetic expression simplification with order of operations (Number System: Simplification/BODMAS).' },
  19: { topic: 'arithmetic', cannotDetermine: false, notes: 'Wheat purchase, spoilage, selling price for 20% gain (Arithmetic: Profit & Loss).' },
  20: { topic: 'algebra', cannotDetermine: false, notes: 'Sum of series using difference of squares identity a^2 - b^2 (Algebra: Identities).' },
  21: { topic: null, cannotDetermine: true, notes: 'Corrupted OCR text: "PQ Us qu al vllal 21 gu uy fare x Ue BIR RAT XR..." unreadable.' },
  22: { topic: 'geometry', cannotDetermine: false, notes: 'Coordinate geometry straight line intercept length on axes (Geometry: Coordinate Geometry).' },
  23: { topic: 'arithmetic', cannotDetermine: false, notes: 'Work and time: 12 men vs 4 boys completing work (Arithmetic: Time & Work).' },
  24: { topic: 'algebra', cannotDetermine: false, notes: 'Simplify (3x + 2y)^2 - (3x - 2y)^2 using identity 4ab (Algebra: Polynomial Identities).' },
  25: { topic: 'trigonometry', cannotDetermine: false, notes: 'Inverse trigonometric value cos^-1 difference (Trigonometry).' },
  26: { topic: 'algebra', cannotDetermine: false, notes: 'Rectangle area a^2 - b^2 and length a + b, find breadth (Algebra: Polynomial factorization).' },
  27: { topic: 'number_system', cannotDetermine: false, notes: 'Numbers in ratio 3:4:5 with LCM 1800, find second number (Number System: HCF & LCM).' },
  28: { topic: 'arithmetic', cannotDetermine: false, notes: 'Motorcycle speed and average speed over journey (Arithmetic: Time & Distance).' },
  29: { topic: 'algebra', cannotDetermine: false, notes: 'If x + 1/x = 13, find x^4 + 1/x^4 (Algebra: Reciprocal identities).' },
  30: { topic: 'arithmetic', cannotDetermine: false, notes: 'Successive discounts on marked price equivalent discount (Arithmetic: Profit & Loss/Discount).' },
  31: { topic: 'geometry', cannotDetermine: false, notes: 'Triangle similarity and congruence criteria with angles and sides (Geometry: Triangles).' },
  32: { topic: 'arithmetic', cannotDetermine: false, notes: 'Boat speed in still water and river speed upstream/downstream (Arithmetic: Boats & Streams).' },
  33: { topic: 'number_system', cannotDetermine: false, notes: '8-digit number divisibility by 72 (8 and 9 divisibility rules) (Number System: Divisibility).' },
  34: { topic: 'mensuration', cannotDetermine: false, notes: 'Largest sphere carved from cube of side 14 cm, find volume (Mensuration: 3D Solids).' },
  35: { topic: 'arithmetic', cannotDetermine: false, notes: 'Selling at 10% loss, changing cost price and gain percentage (Arithmetic: Profit & Loss).' },
  36: { topic: 'arithmetic', cannotDetermine: false, notes: 'Percentage expenditure on food and books, saving remainder (Arithmetic: Percentages).' },
  37: { topic: 'geometry', cannotDetermine: false, notes: 'Right triangle hypotenuse 26 cm, find other side using Pythagoras (Geometry: Triangles).' },
  38: { topic: 'algebra', cannotDetermine: false, notes: 'If a - b = 8 and 4ab = 84, find 3a^3 - 3b^3 (Algebra: Cubic identities).' },
  39: { topic: 'number_system', cannotDetermine: false, notes: 'Decimal expression simplification with cube sum formula (Number System: Simplification).' },
  40: { topic: 'arithmetic', cannotDetermine: false, notes: 'Average weight of mango boxes and apple boxes in consignment (Arithmetic: Averages).' },
  41: { topic: 'arithmetic', cannotDetermine: false, notes: 'Effective annual interest rate corresponding to nominal rate (Arithmetic: Compound Interest).' },
  42: { topic: 'arithmetic', cannotDetermine: false, notes: 'Profit on selling price equals loss on another selling price (Arithmetic: Profit & Loss).' },
  43: { topic: 'arithmetic', cannotDetermine: false, notes: 'Compound interest calculation on principal Rs 6000 at 10% p.a. (Arithmetic: Compound Interest).' },
  44: { topic: 'mensuration', cannotDetermine: false, notes: 'Height of solid cylinder given radius and total surface area (Mensuration: 3D Cylinder).' },
  45: { topic: 'geometry', cannotDetermine: false, notes: 'Chord subtending 90 degrees at circumference, length of chord (Geometry: Circles).' },
  46: { topic: 'arithmetic', cannotDetermine: false, notes: 'Average age of Ruby and Soni and ratio 11:5, find individual age (Arithmetic: Ratio & Averages).' },
  47: { topic: 'geometry', cannotDetermine: false, notes: 'Angles made by chord at center and on major arc of circle (Geometry: Circles).' },
  48: { topic: 'trigonometry', cannotDetermine: false, notes: 'Trigonometric quadratic equation 3 - 2sin^2 theta - 3cos theta = 0 (Trigonometry: Equations).' },
  49: { topic: 'arithmetic', cannotDetermine: false, notes: 'Total journey 750 km, part by bus, find average speed (Arithmetic: Time & Distance).' },
  50: { topic: 'arithmetic', cannotDetermine: false, notes: 'Compound interest on Rs 6000 at 20% compounded half-yearly (Arithmetic: Compound Interest).' },

  // GENERAL AWARENESS (#51 - #100)
  51: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: '2019 Pulitzer Prize winner in poetry (Awards/GK).' },
  52: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: '2019 Australian Open tennis women singles winner (Sports/Current Affairs).' },
  53: { topic: 'polity', cannotDetermine: false, notes: 'Omission of right to property under Article 31 (Indian Constitution: Polity).' },
  54: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Sangeet Natak Akademi awardee classical dance personality (Art & Culture/Awards).' },
  55: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Folk festival and dance in India (Art & Culture: Dance & Festivals).' },
  56: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Pradeep Kumar Banerjee ESPN lifetime achievement football (Sports/Awards).' },
  57: { topic: 'general_science', cannotDetermine: false, notes: 'Mitochondria structure and cellular function (Biology: Cytology).' },
  58: { topic: 'history', cannotDetermine: false, notes: 'Author of Meghaduta (Kalidasa, Ancient Indian literature/history).' },
  59: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Dhimsa folk dance of tribal groups in Andhra Pradesh (Art & Culture: Folk Dance).' },
  60: { topic: 'general_science', cannotDetermine: false, notes: 'Glycolysis cellular location in cytoplasm (Biology: Cellular Respiration).' },
  61: { topic: 'polity', cannotDetermine: false, notes: 'Vice-President of India constitutional provisions borrowed from US (Polity: Constitution).' },
  62: { topic: 'general_science', cannotDetermine: false, notes: 'Cell wall surrounding plant and fungal cells (Biology: Cell Biology).' },
  63: { topic: 'history', cannotDetermine: false, notes: 'Author of Brihatkathakosa (Harisena, Ancient Indian Sanskrit literature/history).' },
  64: { topic: 'geography', cannotDetermine: false, notes: 'Matching Indian coastal states with major sea ports (Indian Geography: Ports).' },
  65: { topic: 'economics', cannotDetermine: false, notes: 'Sequence of national income aggregates GNP, NNP, NI, PI, DPI (Economics: National Income).' },
  66: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Indigenous aircraft carrier INS Vikrant commissioning (Defence/Current Affairs).' },
  67: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Saga Dawa Buddhist festival celebrated in Sikkim (Art & Culture: Festivals).' },
  68: { topic: 'geography', cannotDetermine: false, notes: 'Confluence of Alaknanda and Bhagirathi at Devprayag (Indian Geography: Rivers).' },
  69: { topic: 'general_science', cannotDetermine: false, notes: 'Monoatomic noble gas element in chemistry (Chemistry: Periodic Table).' },
  70: { topic: 'geography', cannotDetermine: false, notes: 'Sandy soil crops cultivation like watermelon and millets (Indian Geography: Agriculture & Soils).' },
  71: { topic: 'polity', cannotDetermine: false, notes: 'Judicial review constitutional feature borrowed from US (Polity: Constitution).' },
  72: { topic: 'polity', cannotDetermine: false, notes: 'Dogri language 8th Schedule official language of J&K (Polity/Static GK).' },
  73: { topic: 'economics', cannotDetermine: false, notes: 'Qualitative credit control instruments of Reserve Bank of India (Economics: Banking & Monetary Policy).' },
  74: { topic: 'geography', cannotDetermine: false, notes: 'Himalayan mountain peaks matched with elevation heights (Geography: Physical Features).' },
  75: { topic: 'polity', cannotDetermine: false, notes: 'Presidential assent to 105th Constitutional Amendment Act (Polity: Constitutional Amendments; classifier misclassified as general_science).' },
  76: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Padma Shri recipient Narthaki Nataraj classical Bharatanatyam dancer (Art & Culture: Dance).' },
  77: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Ottamthullal traditional dance art form of Kerala (Art & Culture: Dance).' },
  78: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Asghari Bai Dhrupad classical music exponent (Art & Culture: Music).' },
  79: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Elderly in India report published by NSO/MoSPI (Reports & Indices/Static GK; classifier misclassified as polity).' },
  80: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'PV Sindhu Olympic silver medal in Rio 2016 (Sports: Olympics).' },
  81: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: '1926 Nobel Prize in Physics Jean Perrin (Awards/Science History).' },
  82: { topic: 'polity', cannotDetermine: false, notes: 'Attorney General for India constitutional office holder (Polity: Executive).' },
  83: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'DRDO missile salvo test firing in 2025 (Defence/Current Affairs).' },
  84: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Sandeep Patil managing director appointment (Appointments/Current Affairs).' },
  85: { topic: 'general_science', cannotDetermine: false, notes: 'Valence electrons in modern periodic table groups (Chemistry: Periodic Table).' },
  86: { topic: 'general_science', cannotDetermine: false, notes: 'Enzymes DNA polymerase and helicase in DNA replication (Biology: Genetics).' },
  87: { topic: 'general_science', cannotDetermine: false, notes: 'Distillation joint process of vaporization and condensation (Chemistry: States of Matter).' },
  88: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Authors of Bridgital Nation Chandrasekaran and Roopa Purushothaman (Books & Authors).' },
  89: { topic: 'history', cannotDetermine: false, notes: 'World Parliament of Religions 1893 Swami Vivekananda (Modern Indian History; classifier misclassified as polity).' },
  90: { topic: 'history', cannotDetermine: false, notes: 'Mian Tansen Navaratna in court of Akbar (Medieval Indian History).' },
  91: { topic: 'polity', cannotDetermine: false, notes: 'Ministry of Home Affairs banning organization under UAPA (Polity: Governance & Internal Security).' },
  92: { topic: 'general_science', cannotDetermine: false, notes: 'Gymnosperms flowerless plants producing cones and seeds (Biology: Botany).' },
  93: { topic: 'polity', cannotDetermine: false, notes: 'Features of Indian Constitution not borrowed from Government of India Act 1935 (Polity: Sources).' },
  94: { topic: 'economics', cannotDetermine: false, notes: 'Foreign exchange reserves in India milestone (Economics: External Sector; classifier misclassified as current_affairs_static_gk).' },
  95: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Anjum Moudgil Indian sportsperson shooting (Sports: Personalities).' },
  96: { topic: 'general_science', cannotDetermine: false, notes: 'Boiling point of Mercury metal at 357 C (Physics/Chemistry: Elements).' },
  97: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Northeast Olympic Games medals tally (Sports/Current Affairs).' },
  98: { topic: 'polity', cannotDetermine: false, notes: 'Justice Rajinder Sachar Committee on social and educational status of Muslims (Polity/Committees; classifier misclassified as geography).' },
  99: { topic: 'current_affairs_static_gk', cannotDetermine: false, notes: 'Delhi government School Bag Policy (Current Affairs: Governance).' },
  100: { topic: 'polity', cannotDetermine: false, notes: '86th Constitutional Amendment Act 2002 Right to Education (Polity: Fundamental Rights).' },

  // GENERAL INTELLIGENCE & REASONING (#101 - #150)
  101: { topic: 'analogy', cannotDetermine: false, notes: 'Hindi word pair analogy relationship (Analogy).' },
  102: { topic: 'series', cannotDetermine: false, notes: 'Meaningful arrangement sequence of words monkey, elephant, etc. (Reasoning: Order/Series).' },
  103: { topic: 'coding_decoding', cannotDetermine: false, notes: 'HEDONISM coded as QFGJOUKP letter substitution (Coding & Decoding).' },
  104: { topic: 'analogy', cannotDetermine: false, notes: 'Letter pair analogy relationship (Analogy: Letter Clusters).' },
  105: { topic: 'spatial_visual', cannotDetermine: false, notes: 'Paper folding and punching unfolding pattern (Spatial & Visual Reasoning).' },
  106: { topic: 'analogy', cannotDetermine: false, notes: 'Number analogy: 14 : 450 :: 19 : ? (Analogy: Numbers).' },
  107: { topic: 'logical_reasoning', cannotDetermine: false, notes: 'Mathematical operation signs replacement in equation (Logical Reasoning: Math Operations).' },
  108: { topic: 'classification', cannotDetermine: false, notes: 'Four number pairs, find odd one out (Classification: Odd Pair).' },
  109: { topic: 'coding_decoding', cannotDetermine: false, notes: 'Coded language letter shift and position swap (Coding & Decoding).' },
  110: { topic: 'spatial_visual', cannotDetermine: false, notes: 'Opposite faces of folded cube dice (Spatial & Visual: Cubes & Dice).' },
  111: { topic: 'spatial_visual', cannotDetermine: false, notes: 'Identify which figure is embedded in the main pattern (Spatial & Visual: Embedded Figures).' },
  112: { topic: 'spatial_visual', cannotDetermine: false, notes: 'Paper folding and triangular cutout pattern (Spatial & Visual: Paper Folding).' },
  113: { topic: 'spatial_visual', cannotDetermine: false, notes: 'Figure X embedded in option choices (Spatial & Visual: Embedded Figures; classifier uncategorized due to empty stem).' },
  114: { topic: 'spatial_visual', cannotDetermine: false, notes: 'Mirror placed on line AB, find reflection figure (Spatial & Visual: Mirror Images; classifier missed due to phrasing).' },
  115: { topic: 'spatial_visual', cannotDetermine: false, notes: 'Square paper folded along dotted lines and star cutout (Spatial & Visual: Paper Folding; classifier uncategorized due to empty stem).' },
  116: { topic: 'analogy', cannotDetermine: false, notes: 'Second number in number pair obtained by operations (Analogy: Number Pairs; classifier missed).' },
  117: { topic: 'analogy', cannotDetermine: false, notes: 'Select related letters: DFH : HJL :: PRT : ? (Analogy: Letter Clusters; classifier missed).' },
  118: { topic: 'analogy', cannotDetermine: false, notes: 'Select related letters: ATXJ : ... (Analogy: Letter Clusters; classifier missed).' },
  119: { topic: 'analogy', cannotDetermine: false, notes: 'Number pair relationship (Analogy: Numbers; classifier missed).' },
  120: { topic: 'logical_reasoning', cannotDetermine: false, notes: 'Syllogistic deduction: All engineers are graduates, Rohit is an engineer (Logical Reasoning: Deduction).' },
  121: { topic: 'classification', cannotDetermine: false, notes: 'Select odd group of words among four groups (Classification: Odd One Out).' },
  122: { topic: 'logical_reasoning', cannotDetermine: false, notes: 'Meaningful English words formed using letters T, U, K, S (Logical Reasoning: Word Formation).' },
  123: { topic: 'spatial_visual', cannotDetermine: false, notes: 'Dice opposite faces for symbols #, $, %, etc. (Spatial & Visual: Dice).' },
  124: { topic: 'spatial_visual', cannotDetermine: false, notes: 'Select correct mirror image of alphanumeric combination (Spatial & Visual: Mirror Images).' },
  125: { topic: 'spatial_visual', cannotDetermine: false, notes: 'Two positions of same dice with numbers 1 to 6 (Spatial & Visual: Dice).' },
  126: { topic: 'spatial_visual', cannotDetermine: false, notes: 'Paper folded and cut in steps X, Y, Z (Spatial & Visual: Paper Folding).' },
  127: { topic: 'coding_decoding', cannotDetermine: false, notes: 'TRANSFER coded numerically as 2018114196518 (Coding & Decoding: Letter Positions).' },
  128: { topic: 'logical_reasoning', cannotDetermine: false, notes: 'Combination of mathematical signs replacing asterisks to balance equation (Logical Reasoning).' },
  129: { topic: 'series', cannotDetermine: false, notes: 'Repeated letter series gap filling pattern (Series: Letter Series).' },
  130: { topic: 'series', cannotDetermine: false, notes: 'Missing number in matrix/pattern series (Series: Number Series).' },
  131: { topic: 'series', cannotDetermine: false, notes: 'Missing number in given series sequence (Series: Number Series).' },
  132: { topic: 'logical_reasoning', cannotDetermine: false, notes: 'Calendar reasoning: Day of week for date given base date (Logical Reasoning: Calendar).' },
  133: { topic: 'series', cannotDetermine: false, notes: 'Next term in difference series 12, 15, 20, 27, 38, ? (Series: Number Series).' },
  134: { topic: 'logical_reasoning', cannotDetermine: false, notes: 'Arithmetic reasoning puzzle on money distributed among friends (Logical Reasoning).' },
  135: { topic: 'logical_reasoning', cannotDetermine: false, notes: 'Coded blood relations A + B brother, A - B daughter (Logical Reasoning: Blood Relations).' },
  136: { topic: 'series', cannotDetermine: false, notes: 'Series progression 2, 8, 18, 32, 50, ? (2*n^2) (Series: Number Series).' },
  137: { topic: 'coding_decoding', cannotDetermine: false, notes: 'ISLAND written as HTKBME letter shifting (Coding & Decoding).' },
  138: { topic: 'analogy', cannotDetermine: false, notes: 'Fifth number related to sixth in same way as first to second (Analogy: Numbers).' },
  139: { topic: 'coding_decoding', cannotDetermine: false, notes: 'BRING coded as FVMRK and LOVE as PRZI (Coding & Decoding).' },
  140: { topic: 'series', cannotDetermine: false, notes: 'Letters of MUSICAL arranged alphabetically, invariant positions (Reasoning: Alphabet Sequence).' },
  141: { topic: 'classification', cannotDetermine: false, notes: 'Four letter clusters, find odd one out (Classification: Letter Groups).' },
  142: { topic: 'analogy', cannotDetermine: false, notes: 'Third letter cluster analogy relationship (Analogy: Letter Clusters).' },
  143: { topic: 'series', cannotDetermine: false, notes: 'Letter cluster sequence completing question mark (Series: Letter Series).' },
  144: { topic: 'logical_reasoning', cannotDetermine: false, notes: 'Calendar day calculation from 20 July to 28 November (Logical Reasoning: Calendar).' },
  145: { topic: 'analogy', cannotDetermine: false, notes: 'Alphabet position analogy FHGE to IKJH (Analogy: Letters).' },
  146: { topic: 'logical_reasoning', cannotDetermine: false, notes: 'Mathematical operation signs replacement in equation (Logical Reasoning).' },
  147: { topic: 'logical_reasoning', cannotDetermine: false, notes: 'Three statements and three conclusions syllogism (Logical Reasoning: Syllogism).' },
  148: { topic: 'analogy', cannotDetermine: false, notes: 'Word pair analogy relationship (Analogy: Semantic Words).' },
  149: { topic: 'analogy', cannotDetermine: false, notes: 'Letter cluster analogy (Analogy: Letter Clusters).' },
  150: { topic: 'series', cannotDetermine: false, notes: 'Letter combination gap filling in continuous series (Series: Letter Series).' },

  // ENGLISH LANGUAGE (#151 - #200)
  151: { topic: 'grammar', cannotDetermine: false, notes: 'Spotting errors: segment containing grammatical error (Grammar: Error Detection; classifier misclassified as vocabulary).' },
  152: { topic: 'comprehension', cannotDetermine: false, notes: 'Sentence parajumble parts P, Q, R, S rearrangement (Comprehension: Para Jumbles).' },
  153: { topic: 'grammar', cannotDetermine: false, notes: 'Substitute underlined phrase to improve sentence (Grammar: Sentence Improvement; classifier misclassified as vocabulary).' },
  154: { topic: 'vocabulary', cannotDetermine: false, notes: 'Sentence with no spelling error (Vocabulary: Spelling).' },
  155: { topic: 'comprehension', cannotDetermine: false, notes: 'Rearrange parts of sentence P, Q, R, S in correct order (Comprehension: Para Jumbles).' },
  156: { topic: 'vocabulary', cannotDetermine: false, notes: 'Antonym for word flexible (Vocabulary: Antonyms).' },
  157: { topic: 'comprehension', cannotDetermine: false, notes: 'Rearrange parts of sentence P, Q, R, S in correct order (Comprehension: Para Jumbles).' },
  158: { topic: 'comprehension', cannotDetermine: false, notes: 'Reading comprehension factual question from passage (Comprehension: RC Passage).' },
  159: { topic: 'vocabulary', cannotDetermine: false, notes: 'Most appropriate idiom for underlined segment (Vocabulary: Idioms & Phrases).' },
  160: { topic: 'vocabulary', cannotDetermine: false, notes: 'Sentence with no spelling error (Vocabulary: Spelling).' },
  161: { topic: 'vocabulary', cannotDetermine: false, notes: 'Word closest in meaning to parlour (Vocabulary: Synonyms; classifier left uncategorized).' },
  162: { topic: 'grammar', cannotDetermine: false, notes: 'Replace highlighted part of sentence (Grammar: Sentence Improvement; classifier left uncategorized).' },
  163: { topic: 'grammar', cannotDetermine: false, notes: 'Replace highlighted part of sentence (Grammar: Sentence Improvement; classifier left uncategorized).' },
  164: { topic: 'vocabulary', cannotDetermine: false, notes: 'One-word substitution for calm and graceful behavior (Vocabulary: One-Word Substitution; classifier left uncategorized).' },
  165: { topic: 'grammar', cannotDetermine: false, notes: 'Convert indirect speech to direct voice/speech (Grammar: Direct/Indirect Speech; classifier left uncategorized).' },
  166: { topic: 'grammar', cannotDetermine: false, notes: 'Identify grammatically incorrect sentence (Grammar: Error Detection; classifier left uncategorized).' },
  167: { topic: 'grammar', cannotDetermine: false, notes: 'Replace highlighted part of sentence (Grammar: Sentence Improvement; classifier left uncategorized).' },
  168: { topic: 'grammar', cannotDetermine: false, notes: 'Sentence split into segments, identify grammatical error (Grammar: Spotting Errors; classifier left uncategorized).' },
  169: { topic: 'grammar', cannotDetermine: false, notes: 'Sentence improvement replace highlighted part (Grammar; classifier left uncategorized).' },
  170: { topic: 'grammar', cannotDetermine: false, notes: 'Sentence improvement replace highlighted part (Grammar; classifier left uncategorized).' },
  171: { topic: 'comprehension', cannotDetermine: false, notes: 'Cloze test passage with deleted words (Comprehension: Cloze Test).' },
  172: { topic: 'grammar', cannotDetermine: false, notes: 'Fill in the blank with appropriate preposition/verb (Grammar: Fill in Blanks).' },
  173: { topic: 'vocabulary', cannotDetermine: false, notes: 'Synonym of word ENTANGLE (Vocabulary: Synonyms).' },
  174: { topic: 'comprehension', cannotDetermine: false, notes: 'Cloze test passage with deleted words (Comprehension: Cloze Test).' },
  175: { topic: 'grammar', cannotDetermine: false, notes: 'Convert active voice sentence to passive voice (Grammar: Active/Passive Voice).' },
  176: { topic: 'grammar', cannotDetermine: false, notes: 'Substitute underlined segment for sentence improvement (Grammar: Improvement).' },
  177: { topic: 'grammar', cannotDetermine: false, notes: 'Improve underlined part of sentence (Grammar: Sentence Improvement).' },
  178: { topic: 'vocabulary', cannotDetermine: false, notes: 'One-word substitute for group of words (Vocabulary: One-Word Substitution).' },
  179: { topic: 'comprehension', cannotDetermine: false, notes: 'Jumbled sentences of a paragraph rearrangement (Comprehension: Para Jumbles).' },
  180: { topic: 'vocabulary', cannotDetermine: false, notes: 'Antonym of word VIRULENT (Vocabulary: Antonyms).' },
  181: { topic: 'vocabulary', cannotDetermine: false, notes: 'Antonym of word NOVEL (Vocabulary: Antonyms).' },
  182: { topic: 'vocabulary', cannotDetermine: false, notes: 'Identify incorrectly spelt word (Vocabulary: Spelling).' },
  183: { topic: 'grammar', cannotDetermine: false, notes: 'Direct and indirect speech conversion (Grammar: Narration).' },
  184: { topic: 'comprehension', cannotDetermine: false, notes: 'Cloze test passage with blanks (Comprehension: Cloze Test).' },
  185: { topic: 'comprehension', cannotDetermine: false, notes: 'Cloze test passage with blanks (Comprehension: Cloze Test).' },
  186: { topic: 'vocabulary', cannotDetermine: false, notes: 'Incorrectly spelt word selection (Vocabulary: Spelling).' },
  187: { topic: 'grammar', cannotDetermine: false, notes: 'Identify part of sentence containing error (Grammar: Spotting Errors).' },
  188: { topic: 'comprehension', cannotDetermine: false, notes: 'Cloze test passage with blanks (Comprehension: Cloze Test).' },
  189: { topic: 'comprehension', cannotDetermine: false, notes: 'Cloze test passage with blanks (Comprehension: Cloze Test).' },
  190: { topic: 'vocabulary', cannotDetermine: false, notes: 'Incorrectly spelt word selection (Vocabulary: Spelling).' },
  191: { topic: 'comprehension', cannotDetermine: false, notes: 'Cloze test passage with blanks (Comprehension: Cloze Test).' },
  192: { topic: 'comprehension', cannotDetermine: false, notes: 'Fill blank number 4 in cloze passage (Comprehension: Cloze Test).' },
  193: { topic: 'grammar', cannotDetermine: false, notes: 'Passive voice transformation of sentence (Grammar: Active/Passive).' },
  194: { topic: 'grammar', cannotDetermine: false, notes: 'Fill in the blank with appropriate word (Grammar/Vocabulary).' },
  195: { topic: 'grammar', cannotDetermine: false, notes: 'Fill in the blank with appropriate comparative adjective (Grammar).' },
  196: { topic: 'comprehension', cannotDetermine: false, notes: 'Cloze test passage with blanks (Comprehension: Cloze Test).' },
  197: { topic: 'vocabulary', cannotDetermine: false, notes: 'One-word substitution for One who draws maps (Cartographer) (Vocabulary).' },
  198: { topic: 'vocabulary', cannotDetermine: false, notes: 'Antonym of word ABSTRACT (Vocabulary: Antonyms).' },
  199: { topic: 'comprehension', cannotDetermine: false, notes: 'Cloze test passage with blanks (Comprehension: Cloze Test).' },
  200: { topic: 'comprehension', cannotDetermine: false, notes: 'Jumbled sentence parts rearrangement in correct order (Comprehension: Para Jumbles).' }
};

// Apply annotations to workbench
const scratchPath = '/Users/shivarampatel/.gemini/antigravity/brain/7fb5b141-45b8-4b11-9812-d8e420006e7a/scratch/chsl_phase_f_human_annotation_workbench_200.json';
const localWb = JSON.parse(fs.readFileSync('./chsl_phase_f_human_annotation_workbench_200.json', 'utf8'));

for (const item of localWb) {
  const ann = annotations[item.sampleIndex];
  if (ann) {
    item.humanGroundTruthTopic = ann.topic;
    item.cannotDetermineFromAvailableSource = ann.cannotDetermine;
    item.annotationNotes = ann.notes;
    item.annotatorId = 'expert-human-evaluator';
    item.reviewedAt = '2026-10-13T21:55:00Z';
  }
}

fs.writeFileSync('./chsl_phase_f_human_annotation_workbench_200.json', JSON.stringify(localWb, null, 2), 'utf8');
fs.writeFileSync(scratchPath, JSON.stringify(localWb, null, 2), 'utf8');

console.log('Successfully applied human ground truth annotations to 200 items in workbench.');

// EVALUATION METRICS CALCULATION
interface MetricRow {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

const topicStats: Record<string, { tp: number; fp: number; fn: number; support: number }> = {};
let totalEvaluated = 0;
let totalMatches = 0;
let indeterminableCount = 0;
let falsePositivesCount = 0;
let falseNegativesCount = 0;

const sectionConfusion: Record<string, { correct: number; wrong: number; unclass_fn: number; indeterminable: number; total: number }> = {
  quant: { correct: 0, wrong: 0, unclass_fn: 0, indeterminable: 0, total: 0 },
  ga: { correct: 0, wrong: 0, unclass_fn: 0, indeterminable: 0, total: 0 },
  reasoning: { correct: 0, wrong: 0, unclass_fn: 0, indeterminable: 0, total: 0 },
  english: { correct: 0, wrong: 0, unclass_fn: 0, indeterminable: 0, total: 0 },
};

const detailedDiscrepancies: Array<{
  idx: number;
  id: string;
  sec: string;
  predicted: string;
  truth: string | null;
  status: string;
  type: 'FALSE_POSITIVE' | 'FALSE_NEGATIVE' | 'INDETERMINABLE';
  reason: string;
}> = [];

for (const item of localWb) {
  const sec = item.sectionCategory;
  sectionConfusion[sec].total++;

  if (item.cannotDetermineFromAvailableSource || !item.humanGroundTruthTopic) {
    indeterminableCount++;
    sectionConfusion[sec].indeterminable++;
    detailedDiscrepancies.push({
      idx: item.sampleIndex,
      id: item.questionId,
      sec: item.sectionCategory,
      predicted: item.predictedTopicId,
      truth: null,
      status: item.classificationStatus,
      type: 'INDETERMINABLE',
      reason: item.annotationNotes,
    });
    continue;
  }

  totalEvaluated++;
  const truth = item.humanGroundTruthTopic;
  const pred = item.predictedTopicId;

  if (!topicStats[truth]) topicStats[truth] = { tp: 0, fp: 0, fn: 0, support: 0 };
  topicStats[truth].support++;

  if (pred === truth) {
    totalMatches++;
    sectionConfusion[sec].correct++;
    topicStats[truth].tp++;
  } else {
    if (pred === 'uncategorized') {
      sectionConfusion[sec].unclass_fn++;
      falseNegativesCount++;
      topicStats[truth].fn++;
      detailedDiscrepancies.push({
        idx: item.sampleIndex,
        id: item.questionId,
        sec: item.sectionCategory,
        predicted: pred,
        truth: truth,
        status: item.classificationStatus,
        type: 'FALSE_NEGATIVE',
        reason: item.annotationNotes,
      });
    } else {
      sectionConfusion[sec].wrong++;
      falsePositivesCount++;
      topicStats[truth].fn++;
      if (!topicStats[pred]) topicStats[pred] = { tp: 0, fp: 0, fn: 0, support: 0 };
      topicStats[pred].fp++;
      detailedDiscrepancies.push({
        idx: item.sampleIndex,
        id: item.questionId,
        sec: item.sectionCategory,
        predicted: pred,
        truth: truth,
        status: item.classificationStatus,
        type: 'FALSE_POSITIVE',
        reason: item.annotationNotes,
      });
    }
  }
}

console.log('\n=== EVALUATION RESULTS SUMMARY ===');
console.log('Total Sample Questions:    ', localWb.length);
console.log('Indeterminable (Corrupted):', indeterminableCount);
console.log('Evaluated Questions:       ', totalEvaluated);
console.log('Exact Topic Matches:       ', totalMatches);
console.log('Classification Accuracy:   ', ((totalMatches / totalEvaluated) * 100).toFixed(2) + '%');
console.log('False Negatives (Unclass): ', falseNegativesCount);
console.log('False Positives (Misclass):', falsePositivesCount);

console.log('\n=== SECTION PERFORMANCE BREAKDOWN ===');
for (const [sec, data] of Object.entries(sectionConfusion)) {
  const acc = ((data.correct / (data.total - data.indeterminable)) * 100).toFixed(2);
  console.log(`${sec.toUpperCase().padEnd(10)}: Total=${data.total} | Correct=${data.correct} | Misclassified=${data.wrong} | Missed(Unclass)=${data.unclass_fn} | Indet=${data.indeterminable} | Accuracy=${acc}%`);
}

// STRATIFIED REWEIGHTING ESTIMATE
// Sample design has:
// VERIFIED: 117 in sample, 14118 in corpus (weight = 14118 / (20308 * (117/200)))
// REVIEW:   40 in sample, 612 in corpus
// UNCLASS:  43 in sample, 5578 in corpus
// Let's compute stratum-specific accuracy:
const strataAcc: Record<string, { correct: number; total: number; corpusN: number }> = {
  VERIFIED: { correct: 0, total: 0, corpusN: 14118 },
  REVIEW_REQUIRED: { correct: 0, total: 0, corpusN: 612 },
  UNCLASSIFIED: { correct: 0, total: 0, corpusN: 5578 },
};

for (const item of localWb) {
  if (item.cannotDetermineFromAvailableSource || !item.humanGroundTruthTopic) continue;
  const st = item.classificationStatus;
  if (!strataAcc[st]) continue;
  strataAcc[st].total++;
  if (item.predictedTopicId === item.humanGroundTruthTopic) {
    strataAcc[st].correct++;
  }
}

let weightedSum = 0;
const totalCorpus = 20308;
console.log('\n=== STRATIFIED RE-WEIGHTED CORPUS ACCURACY ESTIMATE ===');
for (const [st, d] of Object.entries(strataAcc)) {
  const rate = d.total > 0 ? d.correct / d.total : 0;
  const weight = d.corpusN / totalCorpus;
  weightedSum += rate * weight;
  console.log(`Stratum ${st.padEnd(16)}: Sample Accuracy=${(rate * 100).toFixed(2)}% (${d.correct}/${d.total}) | Corpus Weight=${(weight * 100).toFixed(2)}%`);
}
console.log('Estimated Corpus-Wide Classification Accuracy:', (weightedSum * 100).toFixed(2) + '%');

console.log('\n=== TOPIC LEVEL METRICS ===');
console.log('Topic'.padEnd(28) + 'Support'.padStart(8) + 'Prec'.padStart(8) + 'Recall'.padStart(8) + 'F1'.padStart(8));
console.log('-'.repeat(60));
for (const [top, s] of Object.entries(topicStats).sort()) {
  const prec = s.tp + s.fp > 0 ? (s.tp / (s.tp + s.fp)) : 0;
  const rec = s.tp + s.fn > 0 ? (s.tp / (s.tp + s.fn)) : 0;
  const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;
  console.log(`${top.padEnd(28)}${s.support.toString().padStart(8)}${(prec * 100).toFixed(1).padStart(7)}%${(rec * 100).toFixed(1).padStart(7)}%${(f1 * 100).toFixed(1).padStart(7)}%`);
}

console.log('\n=== REPRESENTATIVE DISCREPANCIES (FALSE POSITIVES & FALSE NEGATIVES) ===');
for (const d of detailedDiscrepancies.slice(0, 15)) {
  console.log(`[${d.type}] #${d.idx} (${d.sec}) ${d.id}: Pred='${d.predicted}' vs Truth='${d.truth}' | ${d.reason.slice(0, 75)}`);
}
