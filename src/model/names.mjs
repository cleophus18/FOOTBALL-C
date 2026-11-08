/**
 * Nationality-aware name pools.
 *
 * Generated players must look like they belong to their nation: an Italian regen should
 * not be called "Jordan Smith", and a South African one should not be called "Luca
 * Rossi". Each nation here carries its own first and last name pools. Callers pick a
 * nation first (mostly the league's home nation, with a realistic share of imports) and
 * then draw a name from that nation's pool, so every generated player's name matches
 * his nationality.
 *
 * The pools are deliberately broad (60+ names per side per nation) so names almost
 * never repeat, which is what makes the generated world feel random rather than
 * templated.
 */

/** Default pool for a nation we have not catalogued, so generation never fails. */
const FALLBACK = {
  first: [
    "Alex", "Jordan", "Sam", "Taylor", "Morgan", "Casey", "Robin", "Charlie",
    "Jamie", "Elliot", "Michael", "Kendrick", "Stephen", "Kevin", "Dylan",
    "Owen", "Peter", "Simon", "Victor", "Adrian",
  ],
  last: [
    "Walker", "Bennett", "Carter", "Foster", "Hughes", "Marshall", "Reed",
    "Turner", "Wallace", "Doyle", "Gray", "Fox", "Payne", "Stone", "Mason",
    "Ford", "Grant", "Pearce", "Bishop", "Knight",
  ],
};

export const NAME_POOLS = {
  ENG: {
    first: [
      "Harry", "Jack", "Oliver", "George", "Charlie", "Mason", "Alfie",
      "Freddie", "Archie", "Theo", "Jude", "Declan", "Bukayo", "Phil", "Kyle",
      "Reece", "Marcus", "Jordan", "Callum", "Connor", "Lewis", "Ryan", "Ben",
      "Tom", "Luke", "Kieran", "Aaron", "Nathan", "Josh", "Elliot", "Ollie",
      "Harvey", "Leo", "Isaac", "Adam", "Dylan", "Ethan", "Jacob", "Finley",
      "Oscar", "Louie", "Tyler", "Stanley", "Bobby", "Ezra", "Arlo", "Rowan",
      "Albie", "Jesse", "Ronnie", "Dean", "Cameron", "Liam", "Jake", "Bailey",
      "Samuel", "Frankie", "Teddy", "Alfie-Jay", "Reggie", "Sonny",
    ],
    last: [
      "Smith", "Jones", "Taylor", "Brown", "Wilson", "Davies", "Evans",
      "Thomas", "Roberts", "Walker", "Wright", "Robinson", "Thompson", "White",
      "Hughes", "Edwards", "Green", "Hall", "Wood", "Harris", "Clarke",
      "Jackson", "Turner", "Baker", "Bennett", "Foster", "Ward", "Bell",
      "Cooper", "Bailey", "Reed", "Gray", "Fox", "Payne", "Stone", "Mason",
      "Ford", "Grant", "Pearce", "Bishop", "Knight", "Willis", "Chapman",
      "Webb", "Mills", "Berry", "Rose", "Hart", "Warren", "Dawson", "Lane",
      "Palmer", "Arnold", "Osborne", "Barnes", "Doyle", "Curtis", "Holt",
      "Bryant", "Duncan", "Elliott",
    ],
  },
  ESP: {
    first: [
      "Pablo", "Álvaro", "Carlos", "Javier", "Sergio", "Diego", "Adrián",
      "Raúl", "Marcos", "Iván", "David", "Rubén", "Fernando", "Hugo", "Martín",
      "Aitor", "Unai", "Iker", "Rodrigo", "Nico", "Gavi", "Pedri", "Bryan",
      "Aleix", "Gerard", "Bruno", "Óscar", "Manuel", "Víctor", "Andrés",
      "Alejandro", "Daniel", "Jorge", "Marc", "Pol", "Eric", "Arnau",
      "Jan", "Iker", "Ismael", "Mateo", "Hugo", "Luka", "Álex", "Izan",
      "Joel", "Rui", "Sergi", "Ansu", "Bilal", "César", "Gonzalo", "Mario",
      "Miguel", "Nacho", "Pau", "Salvador", "Tomás", "Yeray", "Adama", "Chema",
    ],
    last: [
      "García", "Rodríguez", "Martínez", "López", "González", "Pérez",
      "Sánchez", "Ramírez", "Torres", "Flores", "Rivera", "Gómez", "Díaz",
      "Reyes", "Cruz", "Morales", "Ortiz", "Gutiérrez", "Castillo", "Jiménez",
      "Romero", "Navarro", "Vidal", "Serrano", "Molina", "Cano", "Herrera",
      "Iglesias", "Cabrera", "Vega", "Fernández", "Ruiz", "Hernández",
      "Moreno", "Muñoz", "Álvarez", "Romero", "Alonso", "Gutiérrez",
      "Carrasco", "Fernández", "Serrano", "Marín", "Mendéz", "Aguilar",
      "Fuentes", "Cortés", "Lucero", "Vargas", "Pascual", "Santana",
      "Cabrera", "Ramos", "Herrera", "Ibáñez", "Solano", "Cordero", "Gil",
      "Molina", "Rojas", "Escobar",
    ],
  },
  GER: {
    first: [
      "Leon", "Maximilian", "Jonas", "Luca", "Felix", "Tim", "Niklas",
      "Julian", "Florian", "Tobias", "Marvin", "Elias", "Noah", "Ben", "Paul",
      "Anton", "Jannik", "Kai", "Robin", "Nico", "Malik", "Jamal", "Serge",
      "Joshua", "Deniz", "Sven", "Marcel", "Philipp", "Andreas", "Lennart",
      "Mats", "Erik", "Fabian", "Moritz", "Samuel", "Till", "Jona", "Mattes",
      "Niko", "Yannik", "Leopold", "Arian", "Emil", "Vincent", "Theo",
      "Levi", "Ilyas", "Jakob", "Fritz", "Aaron", "Jan", "Rafael", "Henry",
      "Jonathan", "Simon", "Nikita", "Umut", "Kaan", "Cem", "Arne", "Bennet",
    ],
    last: [
      "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner",
      "Becker", "Schulz", "Hoffmann", "Koch", "Richter", "Klein", "Wolf",
      "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hofmann",
      "Lange", "Werner", "Krause", "Vogel", "Bauer", "Frank", "Albrecht",
      "Lehmann", "Köhler", "Günther", "Schmitz", "Winkler", "Baumann",
      "Peters", "Hartmann", "Fuchs", "Böhm", "Arnold", "Lorenz", "Keller",
      "Seidel", "Brandt", "Wagner", "Steinbach", "Ebert", "Franke", "Berger",
      "Roth", "Geisler", "Hensel", "Kunz", "Völcker", "Reuter", "Sommer",
      "Wunderlich", "Böckle", "Kruse", "Haas", "Schreiber", "Lindner",
    ],
  },
  ITA: {
    first: [
      "Lorenzo", "Matteo", "Alessandro", "Andrea", "Francesco", "Luca",
      "Marco", "Giuseppe", "Antonio", "Davide", "Simone", "Federico",
      "Riccardo", "Gabriele", "Nicolò", "Tommaso", "Pietro", "Samuele",
      "Christian", "Giacomo", "Emanuele", "Salvatore", "Vincenzo", "Filippo",
      "Stefano", "Roberto", "Fabio", "Daniele", "Andrea", "Mattia", "Alessio",
      "Gianluca", "Cristian", "Leandro", "Damiano", "Giovanni", "Emanuele",
      "Vito", "Sebastiano", "Simone", "Antonio", "Saverio", "Gerardo",
      "Mauro", "Nando", "Denis", "Kevin", "Dario", "Ivan", "Angelo", "Fabrizio",
      "Gianmarco", "Luigi", "Massimo", "Mirko", "Omar", "Pasquale", "Rosario",
      "Silvio", "Tiziano", "Valerio",
    ],
    last: [
      "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo",
      "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca",
      "Costa", "Giordano", "Mancini", "Rizzo", "Lombardi", "Moretti",
      "Barbieri", "Fontana", "Santoro", "Mariani", "Rinaldi", "Caruso",
      "Ferrara", "Galli", "Martini", "Leone", "Longo", "Marchetti", "Pellegrini",
      "Grassi", "Ferretti", "Villa", "Bernardi", "Monti", "Cattaneo", "Serafini",
      "D'Amico", "Rossetti", "Bellini", "Contini", "Fiore", "Pagani", "Sartori",
      "Benedetti", "Milani", "Testa", "Guerra", "Neri", "Zanetti", "Vitali",
      "Bianco", "Sartorio", "Cammarata", "Ventura", "Pisanu", "Corsini", "Basile",
    ],
  },
  FRA: {
    first: [
      "Lucas", "Hugo", "Théo", "Nathan", "Louis", "Gabriel", "Jules", "Adam",
      "Raphaël", "Arthur", "Kylian", "Antoine", "Ousmane", "Aurélien",
      "Kingsley", "Marcus", "Ibrahima", "Boubacar", "Moussa", "Youssouf",
      "Adrien", "Enzo", "Mathis", "Noah", "Ethan", "Maxime", "Rayan", "Nolan",
      "Sacha", "Tristan", "Mathéo", "Evan", "Tiago", "Esteban", "Yanis",
      "Léo", "Noé", "Alassane", "Cheikh", "Malick", "Sébastien", "Nicolas",
      "Jonathan", "Rémy", "Kévin", "Florian", "Baptiste", "Gabin", "Cassius",
      "Ismaël", "Maghnes", "Elye", "Bradley", "Wilson", "Quentin", "Corentin",
      "Amine", "Amine", "Amine", "Zayd", "Eliot", "Naël",
    ],
    last: [
      "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit",
      "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel",
      "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier", "Morel",
      "Girard", "André", "Lefevre", "Mercier", "Dupont", "Lambert", "Bonnet",
      "François", "Martinez", "Legrand", "Faure", "Rousseau", "Blanc",
      "Guerin", "Boyer", "Chevalier", "Gauthier", "Perrin", "Morin", "Colin",
      "Clement", "Menard", "Dumas", "Aubert", "Noel", "Caron", "Gallet",
      "Diallo", "Traoré", "Camara", "Ndiaye", "Sissoko", "Konaté", "Touré",
      "Sarr", "Cissé", "Bakayoko", "Mendy", "Gomis", "Alassane",
    ],
  },
  RSA: {
    first: [
      "Thabo", "Sipho", "Lwazi", "Bongani", "Themba", "Katlego", "Neo",
      "Kagiso", "Tshepo", "Mpho", "Lebo", "Siyabonga", "Ayanda", "Bandile",
      "Dineo", "Karabo", "Lungelo", "Mandla", "Nkosi", "Oscar", "Percy",
      "Rivaldo", "Sibusiso", "Tebogo", "Vusi", "Xolani", "Zola", "Amogelang",
      "Given", "Lehlohonolo", "Tumelo", "Reece", "Junior", "Thulani", "Musa",
      "Falcon", "Khanyisa", "Anele", "Riaan", "Pieter", "Johan", "Willem",
      "Ruan", "Renaldo", "Grant", "Wesley", "Bradley", "Deano", "Ashley",
      "Ronaldo", "Sibusiso", "Yamkelani", "Given", "Simphiwe", "Nathan",
      "Lindokuhle", "Sanele", "Banele", "Oageng", "Tsholofelo", "Khutso",
    ],
    last: [
      "Mokoena", "Nkosi", "Dlamini", "Ndlovu", "Khumalo", "Mahlangu",
      "Mthembu", "Sithole", "Zulu", "Mabaso", "Radebe", "Modise", "Tshabalala",
      "Ntuli", "Maseko", "Cele", "Mbeki", "Pule", "Mnguni", "Sibiya",
      "Molefe", "Motaung", "Booysen", "Van Wyk", "Botha", "Pretorius",
      "Jacobs", "Adams", "Mthethwa", "Mabizela", "Kekana", "Letsholonyane",
      "Masilela", "Gumede", "Mkhize", "Ngcobo", "Zwane", "Buthelezi", "Mabunda",
      "Chivaviro", "Mudau", "Mango", "Nyembe", "Mensah", "Morgan", "Davids",
      "Klaasen", "April", "Williams", "de Goede", "Jantjies", "Kamanjab",
      "Gerber", "Wasserman", "Naaidoo", "Patel", "Kongwa", "Mabuza", "Msimango",
      "Mtshali", "Malinga", "Njoli",
    ],
  },
  POR: {
    first: [
      "João", "Diogo", "Rúben", "Tomás", "Gonçalo", "Bernardo", "Rafael",
      "Pedro", "Tiago", "Miguel", "André", "Bruno", "Vitinha", "Nuno",
      "Ricardo", "Duarte", "Fábio", "Hugo", "Ivo", "Leandro", "Marco",
      "Sérgio", "Vasco", "Alexandre", "Dinis", "Filipe", "Henrique", "Geovany",
      "Samuel", "Rui", "Afonso", "Francisco", "Rodrigo", "Santiago", "Gabriel",
      "Daniel", "Eduardo", "Afonso", "Lourenço", "Vicente", "Simão", "Yuri",
      "André", "Fábio", "Tiquinho", "Zé", "Chiquinho", "Léo", "Danny", "Renato",
      "Matheus", "José", "Nuno", "Beto", "Xadas", "Paulinho", "Martim",
      "Luís", "Otávio", "Alisson", "Rodri",
    ],
    last: [
      "Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa",
      "Rodrigues", "Martins", "Sousa", "Fernandes", "Gonçalves", "Gomes",
      "Lopes", "Marques", "Almeida", "Ribeiro", "Pinto", "Carvalho",
      "Teixeira", "Moreira", "Correia", "Mendes", "Nunes", "Soares", "Vieira",
      "Monteiro", "Cardoso", "Ramos", "Reis", "Antunes", "Coelho", "Batista",
      "Tavares", "Sá", "Neves", "Freitas", "Faria", "Barbosa", "Moura",
      "Branco", "Borges", "Matos", "Aires", "Fonseca", "Baptista", "Morais",
      "Pinho", "Sampaio", "Palhinha", "Camacho", "Domingues", "Rocha", "Amaro",
      "Magalhães", "Moutinho", "Cunha", "Nogueira", "Peixoto", "Leite", "Andrade",
    ],
  },
  BRA: {
    first: [
      "Gabriel", "Lucas", "Matheus", "Rafael", "Pedro", "Gustavo", "Felipe",
      "Bruno", "Thiago", "Vinícius", "Rodrygo", "Endrick", "Éder", "Danilo",
      "Alex", "Caio", "Douglas", "Éverton", "Fernando", "Igor", "João", "Kaio",
      "Léo", "Murilo", "Nathan", "Otávio", "Paulo", "Renan", "Samuel",
      "Wesley", "Vitor", "Juan", "Alan", "Yuri", "Robson", "Willian", "Elias",
      "Guilherme", "Fabrício", "Marcos", "Eduardo", "Luiz", "Ronaldo",
      "Davi", "Bernardo", "Ryan", "Breno", "Kayky", "Marcelo", "Rômulo",
      "Ademir", "Cauã", "Kauã", "Henrique", "Wallace", "Maurício", "Fabinho",
      "Raphael", "Juninho", "Ayrton", "Anderson",
    ],
    last: [
      "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira",
      "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins",
      "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes", "Vieira",
      "Barbosa", "Rocha", "Dias", "Nascimento", "Andrade", "Moreira", "Nunes",
      "Marques", "Machado", "Freitas", "Cardoso", "Ramos", "Gonçalves",
      "Santana", "Teixeira", "Correia", "Cunha", "Cruz", "Pinto", "Mendes",
      "Bittencourt", "Barcelos", "Araújo", "Bezerra", "Camargo", "Chagas",
      "Furtado", "Macedo", "Moura", "Prado", "Queiroz", "Sampaio", "Tavares",
      "Vasconcelos", "Xavier", "Assis", "Bastos", "Cavalcanti", "Dutra",
      "Fagundes", "Galvão", "Henriques",
    ],
  },
  ARG: {
    first: [
      "Santiago", "Mateo", "Juan", "Lautaro", "Julián", "Nicolás", "Facundo",
      "Franco", "Agustín", "Tomás", "Valentín", "Thiago", "Emiliano",
      "Alejandro", "Cristian", "Enzo", "Exequiel", "Giovani", "Leandro",
      "Lisandro", "Marcos", "Nahuel", "Pablo", "Rodrigo", "Ángel", "Bruno",
      "Gonzalo", "Joaquín", "Máximo", "Bautista", "Iker", "Benjamín", "Ian",
      "Elian", "Dylan", "Ramiro", "Iván", "Federico", "Alan", "Matías",
      "Luciano", "Fernando", "Gastón", "Nahuel", "Emiliano", "Ignacio",
      "Alejo", "Fabricio", "Jerónimo", "Beltrán", "Cristopher", "Ezequiel",
      "Tomás", "Ciro", "Uriel", "Thiago", "Vito", "Lucas", "Óscar", "Ignacio",
    ],
    last: [
      "González", "Rodríguez", "Gómez", "Fernández", "López", "Díaz",
      "Martínez", "Pérez", "Álvarez", "Romero", "Sosa", "Torres", "Acosta",
      "Benítez", "Medina", "Herrera", "Aguirre", "Pereyra", "Giménez",
      "Molina", "Silva", "Castro", "Ríos", "Ledesma", "Quintero", "Vera",
      "Cabrera", "Ojeda", "Navarro", "Figueroa", "Bustos", "Coronel",
      "Maldonado", "Sánchez", "Ferreyra", "Paredes", "Aguero", "Maciel",
      "Barrios", "Ayala", "Cáceres", "Valdez", "Ramírez", "Domínguez",
      "Ortiz", "Rojas", "Villalba", "Franco", "Cardozo", "Ortega", "Alarcón",
      "Báez", "Galeano", "Fleitas", "Cisterna", "Gutierrez", "Ovando",
      "Sosa", "Mendoza", "Britez", "Insaurralde",
    ],
  },
  NED: {
    first: [
      "Daan", "Sem", "Lucas", "Finn", "Milan", "Levi", "Luuk", "Bram",
      "Thijs", "Ruben", "Cody", "Frenkie", "Matthijs", "Denzel", "Jurriën",
      "Ryan", "Steven", "Teun", "Xavi", "Wout", "Joey", "Jesse", "Tijmen",
      "Sven", "Kees", "Niels", "Tim", "Stijn", "Rick", "Rens", "Mees",
      "Thijs", "Vigo", "Kees", "Bjorn", "Dex", "Nout", "Florian", "Chris",
      "Mika", "Olivier", "Quinten", "Sven", "Dirk", "Thom", "Bart", "Melle",
      "Pepijn", "Robbin", "Sammie", "Sander", "Sjors", "Ties", "Wessel",
      "Youri", "Roan", "Cees", "Guus", "Hidde", "Ivo", "Jort", "Koen",
    ],
    last: [
      "de Jong", "van Dijk", "de Vrij", "van de Beek", "de Ligt", "Blind",
      "Depay", "Bergwijn", "Klaassen", "de Roon", "Dumfries", "Frimpong",
      "Simons", "Timber", "van Bergen", "van Hooijdonk", "Bakker", "Visser",
      "Smit", "Meijer", "de Boer", "van den Berg", "Jansen", "Mulder", "Bos",
      "Hendriks", "Dekker", "Brouwer", "Willems", "Vos", "Peters", "Hendriksen",
      "Groot", "van Leeuwen", "Dijkstra", "Bakx", "van Ginneken", "van Loon",
      "Kuipers", "van Rijn", "Smeets", "van Gisbergen", "Snijders", "van Veen",
      "Sanders", "Molenaar", "Post", "van der Linden", "Willemsen", "Rietveld",
      "Kuipers", "van Dam", "Doornbos", "van Aken", "Pronk", "Huigen",
      "Verhoeven", "Kuijt", "Diederen", "van Asselt", "Swart", "Roosenboom",
    ],
  },
  USA: {
    first: [
      "Tyler", "Christian", "Weston", "Yunus", "Jackson", "Brandon",
      "Brenden", "Ricardo", "Giovanni", "Josh", "Diego", "Caden", "Aidan",
      "Cole", "Erik", "Forrest", "Gianluca", "Henry", "Julian", "Kevin",
      "Landon", "Malik", "Noah", "Owen", "Riley", "Sergio", "Trevor",
      "Walker", "Zack", "Dante", "Tanner", "Tessmann", "Paxten", "Quinn",
      "Gaga", "Kobe", "Rokas", "Moses", "Samuel", "Caleb", "Griffin", "Duncan",
      "McKenzie", "Chidozie", "Emeka", "Jonathan", "Rafa", "Marlon", "Tim",
      "DeJuan", "Jalen", "Fidel", "Bryce", "Alvarez", "Chase", "Keller",
      "Casey", "Johnny", "Paxton", "Easton", "Reed", "Sullivan", "Dax",
    ],
    last: [
      "Adams", "Reyna", "McKennie", "Musah", "Robinson", "Vázquez",
      "Aaronson", "Ferreira", "Pulisic", "Sargent", "Turner", "Richards",
      "Cardoso", "Tillman", "Luna", "Sullivan", "Gomez", "Miller", "Davis",
      "Wilson", "Anderson", "Thomas", "Clark", "Lewis", "Walker", "Hall",
      "Young", "King", "Wright", "Moore", "Thompson", "White", "Harris",
      "Sanchez", "Ramirez", "Torres", "Flores", "Green", "Adams", "Nelson",
      "Campbell", "Mitchell", "Roberts", "Carter", "Phillips", "Evans",
      "Turner", "Diaz", "Cruz", "Reyes", "Ortega", "Vega", "Serrano",
      "Marshall", "Reynolds", "Cowan", "Zimmerman", "Long", "Miles", "Bellegarde",
    ],
  },
  JPN: {
    first: [
      "Takumi", "Kaoru", "Daichi", "Hiroki", "Wataru", "Ritsu", "Junya",
      "Takefusa", "Ao", "Koki", "Daizen", "Ayase", "Hidemasa", "Ko",
      "Naomichi", "Takuma", "Yuki", "Zion", "Shuto", "Gaku", "Keito", "Sota",
      "Ren", "Kaito", "Haruto", "Yuto", "Riku", "Sho", "Kazuki", "Tatsuya",
      "Soma", "Hayato", "Yuya", "Shion", "Kanta", "Reo", "Kensuke", "Koji",
      "Kyo", "Ryota", "Sosuke", "Tsubasa", "Yamato", "Keigo", "Masaya",
      "Natsuki", "Rihito", "Seiya", "Taiga", "Yasuki", "Yoshihiro", "Keita",
      "Mao", "Ryo", "Shuhei", "Tsubasa", "Yuito", "Jin", "Minato", "Kanji",
    ],
    last: [
      "Minamino", "Mitoma", "Kamada", "Endo", "Tanaka", "Doan", "Ito",
      "Kubo", "Sugawara", "Maeda", "Ueda", "Morita", "Itakura", "Soma",
      "Asano", "Abe", "Suzuki", "Sato", "Takahashi", "Watanabe", "Yamamoto",
      "Nakamura", "Kobayashi", "Kato", "Yoshida", "Yamada", "Sasaki",
      "Yamaguchi", "Matsumoto", "Inoue", "Kimura", "Hayashi", "Shimizu",
      "Yamagata", "Ikeda", "Hashimoto", "Ishikawa", "Ogawa", "Fujita",
      "Okada", "Gonda", "Hasegawa", "Hori", "Kanno", "Maruyama", "Miyoshi",
      "Nagatomo", "Nishimura", "Onaiwu", "Sakai", "Sugimoto", "Tsunehiro",
      "Yamane", "Yasui", "Iwasaki", "Kaneko", "Mita", "Nishio", "Okano",
      "Shibata", "Terauchi",
    ],
  },
  NGA: {
    first: [
      "Victor", "Samuel", "Emmanuel", "Ademola", "Alex", "Wilfred", "Kelechi",
      "Moses", "Joe", "Calvin", "Terem", "Nathan", "Chidera", "Ebenezer",
      "Fisayo", "Gift", "Joshua", "Kenneth", "Michael", "Ndidi", "Ola",
      "Paul", "Raphael", "Sunday", "Taiwo", "Uche", "Vincent", "Zaidu",
      "Chidera", "Chukwudi", "Cyril", "Daniel", "Ebube", "Emeka", "Femi",
      "Godwin", "Ibrahim", "Ifeanyi", "Isaac", "John", "Kingsley", "Lucky",
      "Nnamdi", "Obinna", "Oghenekaro", "Oluwaseun", "Osei", "Peter",
      "Samson", "Sylvester", "Timothy", "Tunde", "Yakubu", "Yusuf", "Bamidele",
      "Chisom", "David", "Ejike", "Henry", "Ikechukwu", "Jamal", "Kehinde",
    ],
    last: [
      "Osimhen", "Chukwueze", "Iheanacho", "Lookman", "Iwobi", "Ndidi",
      "Onyeka", "Simon", "Aribo", "Bassey", "Moffi", "Aina", "Akpom",
      "Balogun", "Dennis", "Ekwueme", "Frank", "George", "Henry", "Idowu",
      "John", "Kalu", "Lukman", "Mba", "Nwosu", "Okoye", "Peter", "Raji",
      "Success", "Uzoho", "Adeyemi", "Aina", "Amoo", "Awoniyi", "Bamgbose",
      "Chukwu", "Ejaria", "Etebo", "Ibrahim", "Iwuala", "Musa", "Nwankwo",
      "Obi", "Ogundu", "Ojo", "Olayinka", "Onyedika", "Osho", "Popoola",
      "Sanusi", "Uche", "Yakubu", "Adeniyi", "Obasa", "Okonkwo", "Oyebanji",
      "Onuachu", "Ezeh", "Nabosi", "Umeh",
    ],
  },
};

/* Second tier of footballing nations used for World Cup squads and imports. */
Object.assign(NAME_POOLS, {
  BEL: {
    first: [
      "Kevin", "Romelu", "Dries", "Thibaut", "Youri", "Leander", "Charles",
      "Amadou", "Lois", "Maxim", "Orel", "Arthur", "Zeno", "Aster", "Michy",
      "Yari", "Aster", "Senne", "Mario", "Théo", "Mats", "Nicolas", "Sebastiaan",
      "Hans", "Jelle", "Kasper", "Wout", "Nathan", "Ruben", "Koni", "Zeno",
    ],
    last: [
      "De Bruyne", "Lukaku", "Mertens", "Courtois", "Tielemans", "De Ketelaere",
      "Onana", "Openda", "Opoku", "De Cuyper", "Vermeeren", "Theate", "Faes",
      "Castagne", "Doku", "Carrasco", "Sels", "Vertonghen", "Alderweireld",
      "Meunier", "Trossard", "Bentancur", "Bakayoko", "Vranckx", "Lammens",
      "Debast", "Openda", "Vanaken", "Lukebakio", "Sabani",
    ],
  },
  CRO: {
    first: [
      "Luka", "Mateo", "Ivan", "Josip", "Martin", "Borna", "Kristijan",
      "Lovro", "Marko", "Dominik", "Petar", "Filip", "Andrej", "Marcelo",
      "Mijo", "Bruno", "Franjo", "Igor", "Nikola", "Tomas", "Ante", "Duje",
    ],
    last: [
      "Modrić", "Kovačić", "Perišić", "Brozović", "Gvardiol", "Livaković",
      "Sosa", "Vlašić", "Majer", "Sučić", "Musa", "Baturina", "Pongračić",
      "Šutalo", "Juranović", "Stanišić", "Pašalić", "Kramarić", "Budimir",
      "Petković", "Vuković", "Ćaleta-Car",
    ],
  },
  URU: {
    first: [
      "Federico", "Darwin", "Manuel", "Ronald", "Facundo", "Nicolás",
      "Maximiliano", "Mathías", "Brian", "Rodrigo", "Giorgian", "Lucas",
      "Diego", "Agustín", "Sebastián", "Emiliano", "Martín", "Gonzalo",
    ],
    last: [
      "Valverde", "Núñez", "Ugarte", "Araújo", "Pellistri", "De la Cruz",
      "Olivera", "Vecino", "Rodríguez", "Bentancur", "Arrascaeta", "Gómez",
      "Goddín", "Cáceres", "Torreira", "Laxalt", "Suárez", "Cavani",
    ],
  },
  COL: {
    first: [
      "James", "Jhon", "Luis", "Yerry", "Davinson", "Jhon", "Jorge",
      "Rafael", "Juan", "Daniel", "Kevin", "Miguel", "Jefferson", "Jhon",
      "Andrés", "Mateus", "Camilo", "Deiver", "Jhon", "Richard",
    ],
    last: [
      "Díaz", "Arias", "Sinisterra", "Mina", "Sánchez", "Carrascal",
      "Urrego", "Ospina", "Cuadrado", "Muñoz", "Castano", "Cardona",
      "Lerma", "Ríos", "Uribe", "Borré", "Zapata", "Machado", "Córdoba",
      "Quintero",
    ],
  },
  MEX: {
    first: [
      "Santiago", "Hirving", "Jesús", "Carlos", "César", "Edson", "Luis",
      "Johan", "Kevin", "Alexis", "Uriel", "Erick", "Diego", "Obed", "Israel",
      "Julián", "Roberto", "Orbelín", "Sebastián", "Raúl",
    ],
    last: [
      "Giménez", "Lozano", "Corona", "Salcedo", "Montes", "Álvarez",
      "Chávez", "Vásquez", "Álvarez", "Vega", "Antuna", "Sánchez", "Lainez",
      "Vargas", "Reyes", "Quiñones", "Alvarado", "Pineda", "Córdova", "Jiménez",
    ],
  },
  SUI: {
    first: [
      "Granit", "Manuel", "Remo", "Nico", "Breel", "Ruben", "Dan", "Fabian",
      "Xhaka", "Denis", "Michel", "Noah", "Simon", "Cédric", "Kwadwo", "Jonas",
    ],
    last: [
      "Xhaka", "Akanji", "Freuler", "Elvedi", "Embolo", "Vargas", "Ndoye",
      "Rieder", "Amdouni", "Steffen", "Aebischer", "Okafor", "Sierro",
      "Zakaria", "Widmer", "Duah", "Schaub", "Sorgic",
    ],
  },
  SEN: {
    first: [
      "Sadio", "Kalidou", "Ismaila", "Boulaye", "Pape", "Habib", "Nicolas",
      "Krépin", "Famara", "Iliman", "Mamadou", "Cheikhou", "Abdou", "Formose",
      "Moussa", "Pape", "Youssou", "Dion", "Lamine", "Édouard",
    ],
    last: [
      "Mané", "Koulibaly", "Sarr", "Dia", "Gueye", "Diallo", "Jackson",
      "Diatta", "Dieng", "Ndiaye", "Ciss", "Kouyaté", "Diallo", "Mendy",
      "Niakhaté", "Sarr", "Sabaly", "Camara", "Bamba", "Diouf",
    ],
  },
  MAR: {
    first: [
      "Hakim", "Youssef", "Achraf", "Sofyan", "Bilal", "Azzedine", "Ilias",
      "Nayef", "Boufal", "Yassine", "Selim", "Amine", "Anas", "Yahia", "Ilias",
      "Tarik", "Ryad", "Zakaria", "Reda", "Ayoub",
    ],
    last: [
      "Ziyech", "En-Nesyri", "Hakimi", "Amrabat", "El Khannouss", "Ounahi",
      "Chair", "Aguerd", "Farras", "Bounou", "Amsis", "Haroun", "El Kaabi",
      "Atiat-Allah", "Chahiri", "Tissoudali", "Bougrine", "Aboukhlal", "Ouahdi",
    ],
  },
  TUR: {
    first: [
      "Arda", "Hakan", "Kenan", "Kerem", "Fernando", "Zeki", "Cengiz", "Orkun",
      "Ismail", "Enes", "Merih", "Altay", "Ozan", "Umut", "Bertug", "Halil",
      "Salih", "Baris", "Berat", "Yusuf",
    ],
    last: [
      "Güler", "Çalhanoğlu", "Yıldız", "Aktürkoğlu", "Muslera", "Çelik",
      "Ünder", "Kökçü", "Yıldırım", "Ünal", "Demiral", "Bayındır", "Kabak",
      "Nayir", "Yılmaz", "Dursun", "Özcan", "Yakışık", "Cengiz", "Kurucay",
    ],
  },
  KOR: {
    first: [
      "Heung-min", "Min-jae", "Kang-in", "In-beom", "Woo-young", "Jae-sung",
      "Seung-ho", "Ui-jo", "Young-gwon", "Chan-hee", "Tae-hwan", "Seung-gyu",
      "Ji-soo", "Hyun-woo", "Dong-jun", "Sang-ho", "Jun-ho", "Won-du",
    ],
    last: [
      "Son", "Kim", "Lee", "Hwang", "Jung", "Kwon", "Paik", "Cho", "Park",
      "Yoon", "Baek", "Seo", "Ahn", "Choi", "Yang", "Ko", "Hong", "Shin",
    ],
  },
  POL: {
    first: [
      "Robert", "Piotr", "Jakub", "Sebastian", "Nicola", "Przemysław",
      "Bartosz", "Adam", "Michal", "Karol", "Kamil", "Tomasz", "Wojciech",
      "Jan", "Filip", "Damian", "Pawel", "Krzysztof", "Dominik", "Mateusz",
    ],
    last: [
      "Lewandowski", "Zieliński", "Kiwior", "Szymański", "Zalewski",
      "Frankowski", "Salamon", "Buksa", "Skorupski", "Świderski", "Grosicki",
      "Kędziora", "Szczęsny", "Bednarek", "Młański", "Piątek", "Wieteska",
      "Piątkowski", "Marchwicki", "Kwiatkowski",
    ],
  },
  GHA: {
    first: [
      "Mohammed", "Antoine", "Thomas", "Daniel", "Jordan", "Majeed", "Inaki",
      "Ransford", "Salis", "Ernest", "Kamaldeen", "Joseph", "Alidu", "Abdul",
      "Gideon", "Elisha", "Kingsley", "Mubarak", "Ibrahim", "Tariq",
    ],
    last: [
      "Kudus", "Semenyo", "Partey", "Amartey", "Ayew", "Sulemana", "Williams",
      "Owusu", "Sambou", "Nuamah", "Sulemana", "Paintsil", "Seidu", "Salifu",
      "Mensah", "Owusu", "Schlupp", "Wakaso", "Osman", "Lamptey",
    ],
  },
  CIV: {
    first: [
      "Simon", "Franck", "Nicolas", "Evan", "Sekou", "Wilfried", "Jean",
      "Ismaël", "Sébastien", "Amad", "Oumar", "Yao", "Odilon", "Kossounou",
      "Emmanuel", "Ghislain", "Charles", "Yannick", "Jeremie", "Nicolas",
    ],
    last: [
      "Adingra", "Kessié", "Pépé", "Ndicka", "Fofana", "Zaha", "Seri",
      "Diomandé", "Haller", "Diallo", "Kossounou", "Sangaré", "Kossidou",
      "Akonor", "Lagois", "Konan", "Traoré", "Gbagbo", "Dela", "Boly",
    ],
  },
  AUS: {
    first: [
      "Mitchell", "Mathew", "Craig", "Jackson", "Kusini", "Cameron", "Nathaniel",
      "Connor", "Jordan", "Aiden", "Samuel", "Keanu", "Alex", "Harry", "Ryan",
      "Lachlan", "Denis", "Adam", "Joel", "Bruno",
    ],
    last: [
      "Duke", "Ryan", "Goodwin", "Irvine", "Yengi", "Behich", "Bos", "Metcalfe",
      "Vidmar", "O'Neill", "Souttar", "Baccus", "Grant", "Trewin", "Teague",
      "Vallis", "Geria", "Taggart", "King", "Fornaroli",
    ],
  },
  CAN: {
    first: [
      "Alphonso", "Jonathan", "Tajon", "Stephen", "Cyle", "Liam", "Ismaël",
      "Moïse", "Tani", "Derek", "Ali", "Niko", "Sam", "Maxime", "Richie",
      "Jacob", "Kamal", "Victor", "Lucas", "Mathew",
    ],
    last: [
      "Davies", "David", "Buchanan", "Eustáquio", "Larin", "Miller",
      "Koné", "Cho", "Oluwaseyi", "Cornelius", "Ahmed", "Sígurdsson",
      "Adekugbe", "Crépeau", "Laryea", "Shaffelburg", "Miller", "Cyr",
      "Bombito", "Choinière",
    ],
  },
  EGY: {
    first: [
      "Mohamed", "Omar", "Mahmoud", "Mostafa", "Ahmed", "Tarek", "Emam",
      "Ibrahim", "Yasser", "Trézéguet", "Hamdi", "Mohamed", "Zizo", "Walid",
      "Mahmoud", "Akram", "Ahmed", "Ahmed", "Osama", "Nasser",
    ],
    last: [
      "Salah", "Marmoush", "Trezeguet", "Elneny", "Hegazi", "Ashour", "Adel",
      "Fathy", "Ibrahim", "Ali", "Fayed", "Elhajjar", "Sobhi", "Sayed",
      "Hamdy", "Tawfik", "Ramadan", "Zizo", "Fathy", "Maher",
    ],
  },
  UKR: {
    first: [
      "Mykhailo", "Artem", "Andriy", "Oleksandr", "Illia", "Viktor", "Ruslan",
      "Georgiy", "Vitalii", "Mykola", "Taras", "Sergiy", "Danylo", "Yukhym",
      "Oleksandr", "Yehor", "Vladyslav", "Maksym", "Roman", "Bohdan",
    ],
    last: [
      "Mudryk", "Dovbyk", "Yarmolenko", "Zinchenko", "Zabarnyi", "Tsyhankov",
      "Malinovskyi", "Sudakov", "Mykolenko", "Matviyenko", "Stepanenko",
      "Sydorchuk", "Sikan", "Konoplia", "Svatok", "Yaremchuk", "Vanat",
      "Braharus", "Yurchenko", "Lunin",
    ],
  },
});

/** The nation codes we have real name pools for. */
export const CATALOGUED_NATIONS = Object.keys(NAME_POOLS);

/** All first names for a nation, or the fallback pool if unknown. */
export function firstNamesFor(nation) {
  return (NAME_POOLS[nation] ?? FALLBACK).first;
}

/** All last names for a nation, or the fallback pool if unknown. */
export function lastNamesFor(nation) {
  return (NAME_POOLS[nation] ?? FALLBACK).last;
}

/**
 * Build a random name for a nation. `rng` is any object exposing `.pick(array)`.
 * We draw independently from the first and last pools so combinations are effectively
 * unique. The pools are sized so that even a squad of 30 from the same nation
 * repeats a full name with vanishing probability.
 */
export function randomNameFor(rng, nation) {
  const first = rng.pick(firstNamesFor(nation));
  const last = rng.pick(lastNamesFor(nation));
  return { first, last };
}
