/**
 * Contenu du guide d'utilisation.
 *
 * Séparé du composant pour deux raisons. D'abord parce qu'un guide se relit et
 * se corrige comme un texte, pas comme du balisage. Ensuite parce qu'il doit
 * rester vrai : chaque fiche décrit ce que l'application fait réellement
 * aujourd'hui, et la rubrique « ce que ça ne fait pas » est aussi importante
 * que les autres. Un manuel qui promet une fonction absente coûte plus cher
 * qu'un manuel incomplet — l'utilisateur cherche, ne trouve pas, et cesse de
 * faire confiance au reste.
 */

export interface GuideStep {
  /** Ce que la personne fait, à l'impératif et sans jargon. */
  action: string;
  /** Ce qu'elle voit ensuite, pour qu'elle sache si elle a réussi. */
  result?: string;
}

export interface GuideSection {
  id: string;
  /** Numéro affiché au sommaire. */
  number: number;
  title: string;
  /** Une phrase, lisible seule. */
  summary: string;
  purpose: string;
  audience: string;
  steps: GuideStep[];
  tips?: string[];
  /** Limites réelles, dites franchement. */
  limits?: string[];
  troubleshooting?: { problem: string; answer: string }[];
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'demarrage',
    number: 1,
    title: 'Démarrage',
    summary: 'Se connecter, comprendre l’écran, savoir ce que votre rôle vous permet.',
    purpose:
      'Vous ouvrez l’application pour la première fois. Cette fiche explique comment entrer, ce que vous voyez, et pourquoi deux collègues n’ont pas les mêmes menus.',
    audience: 'Tout le monde.',
    steps: [
      {
        action:
          'Ouvrez l’adresse de l’application dans votre navigateur, puis saisissez votre courriel et votre mot de passe.',
        result:
          'Vous arrivez sur l’écran correspondant à votre métier : la carte pour un régulateur, « Ma tournée » pour un chauffeur.',
      },
      {
        action:
          'Regardez la barre du haut : elle indique votre organisation, votre devise, votre fuseau horaire et votre rôle.',
        result:
          'Si le nom de l’organisation n’est pas le vôtre, ne continuez pas et prévenez votre administrateur.',
      },
      {
        action: 'Parcourez le menu de gauche. Il ne montre que les écrans ouverts à votre rôle.',
      },
      {
        action: 'Sur téléphone, ajoutez l’application à votre écran d’accueil depuis le menu du navigateur.',
        result: 'Elle s’ouvre alors comme une application, et fonctionne même sans réseau.',
      },
    ],
    tips: [
      'Un chauffeur n’a besoin que de deux écrans : « Ma tournée » et ses consignes. Le reste ne lui est pas proposé.',
      'Le thème sombre se règle depuis la barre du haut : utile la nuit, en cabine.',
    ],
    limits: [
      'Les données d’une organisation ne sont jamais visibles depuis une autre. Ce cloisonnement est appliqué par la base de données elle-même, pas seulement par l’affichage.',
    ],
    troubleshooting: [
      {
        problem: 'Le mot de passe est refusé.',
        answer:
          'Vérifiez la casse et l’absence d’espace en fin de saisie. Après plusieurs essais rapprochés, l’application ralentit volontairement les tentatives : attendez une minute.',
      },
      {
        problem: 'Un écran affiche « accès refusé ».',
        answer:
          'Votre rôle ne l’autorise pas. Demandez à votre administrateur de modifier vos droits ; ce n’est pas une panne.',
      },
    ],
  },
  {
    id: 'ma-tournee',
    number: 2,
    title: 'Ma tournée — la console du chauffeur',
    summary: 'Le téléphone du conducteur devient la source de toutes les mesures.',
    purpose:
      'C’est l’écran le plus important de l’application. Sans lui, rien n’est mesuré : ni les trajets, ni le score de conduite, ni les primes. Le chauffeur démarre sa tournée, et son téléphone transmet sa position pendant qu’il roule.',
    audience: 'Le chauffeur, sur son téléphone.',
    steps: [
      {
        action: 'Ouvrez « Ma tournée ». Vérifiez que le camion affiché est bien le vôtre.',
        result: 'Si aucun véhicule n’apparaît, votre gestionnaire doit d’abord vous en affecter un.',
      },
      {
        action: 'Appuyez sur « Démarrer la tournée » et acceptez la demande de localisation.',
        result: 'Le compteur « positions transmises » commence à augmenter.',
      },
      {
        action: 'Posez le téléphone sur son support, écran allumé, branché sur l’allume-cigare.',
      },
      {
        action: 'À l’arrivée, appuyez sur « Terminer la tournée ».',
        result: 'Les positions restantes partent, et le trajet est reconstruit côté serveur.',
      },
    ],
    tips: [
      'Branchez le téléphone : la mesure consomme de la batterie.',
      'Hors réseau, tout continue d’être enregistré sur l’appareil et repart au retour du signal. Rien n’est perdu.',
    ],
    limits: [
      'Si l’écran s’éteint ou si vous passez sur une autre application, le navigateur suspend la mesure. L’écran vous en avertit et indique combien de minutes n’ont pas été enregistrées.',
      'Un suivi continu écran éteint demanderait une application Android installée, ou un boîtier posé dans le camion. Ce n’est pas encore le cas.',
    ],
    troubleshooting: [
      {
        problem: 'Le compteur « en attente d’envoi » monte sans redescendre.',
        answer: 'Vous êtes hors réseau. C’est normal : les positions sont conservées et partiront seules.',
      },
      {
        problem: '« Aucune affectation trouvée ».',
        answer:
          'Votre compte n’est rattaché à aucune fiche chauffeur. Votre gestionnaire fait le rattachement depuis « Flotte & chauffeurs ».',
      },
    ],
  },
  {
    id: 'carte',
    number: 3,
    title: 'Carte & suivi temps réel',
    summary: 'Où sont les camions, et ce qu’ils ont fait sur la route.',
    purpose:
      'L’écran de travail quotidien du régulateur : voir la flotte, ouvrir la trace d’un véhicule, décider d’appeler un chauffeur ou de prévenir un client d’un retard.',
    audience: 'Régulateur, gestionnaire de flotte, responsable sécurité.',
    steps: [
      {
        action: 'Ouvrez « Carte & suivi temps réel ».',
        result: 'La carte se centre sur le corridor de votre pays.',
      },
      { action: 'Cliquez sur un camion pour voir sa dernière position connue et son chauffeur.' },
      { action: 'Ouvrez sa trace pour suivre le chemin parcouru.' },
    ],
    tips: [
      'Un camion sans position récente n’a pas disparu : son chauffeur n’a probablement pas démarré sa tournée.',
    ],
    limits: [
      'Les positions viennent des téléphones des chauffeurs. Un conducteur qui n’a pas démarré sa tournée n’apparaît pas.',
      '« Temps réel » signifie « à la dernière remontée » : les positions arrivent par lots de quelques minutes, pour épargner la batterie et le forfait.',
    ],
  },
  {
    id: 'alertes',
    number: 4,
    title: 'Centre d’alertes',
    summary: 'Les faits qui demandent une décision, et la trace de ce que vous en avez fait.',
    purpose:
      'L’application ne vous prévient de rien qu’elle n’ait constaté. Chaque alerte porte le fait qui l’a produite : une infraction relevée sur la trace, un document qui expire, un écart entre deux pleins.',
    audience: 'Gestionnaire de flotte, responsable sécurité.',
    steps: [
      { action: 'Ouvrez « Centre d’alertes ». Les plus graves sont en tête.' },
      { action: 'Filtrez par catégorie ou par gravité si la liste est longue.' },
      {
        action:
          'Ouvrez une alerte, lisez le fait qui l’a produite, puis marquez-la « en cours », « résolue » ou « écartée » en écrivant pourquoi.',
        result:
          'Votre décision et sa date sont conservées. C’est ce qui distingue un suivi d’une liste qui s’allonge.',
      },
    ],
    tips: [
      'Écartez une alerte plutôt que de l’ignorer : la note explique à votre successeur pourquoi elle ne comptait pas.',
      'Un écart de consommation n’établit pas un vol. Une charge lourde, une piste dégradée ou un injecteur usé l’expliquent aussi.',
    ],
    limits: [
      'Aucune notification n’est envoyée par message ni par courriel. Les alertes se consultent ici.',
      'L’écran ne se met pas à jour tout seul : rechargez-le pour voir les alertes survenues depuis son ouverture.',
    ],
  },
  {
    id: 'trajets',
    number: 5,
    title: 'Historique des trajets',
    summary: 'Ce que chaque camion a réellement fait, reconstruit depuis les positions.',
    purpose:
      'Les trajets ne sont pas saisis : ils sont déduits des positions transmises. Un arrêt de plus de vingt minutes termine un trajet, et le suivant commence au redémarrage.',
    audience: 'Gestionnaire de flotte, exploitation, facturation.',
    steps: [
      { action: 'Ouvrez « Historique des trajets » et choisissez un véhicule.' },
      { action: 'Lisez la distance, la durée, le nombre d’arrêts et la vitesse maximale relevée.' },
    ],
    tips: [
      'La distance sert de base au calcul de consommation et aux heures de conduite : c’est la donnée la plus structurante de l’application.',
    ],
    limits: [
      'Un trajet effectué sans que le chauffeur ait démarré sa tournée n’existe pas dans l’application.',
    ],
  },
  {
    id: 'missions',
    number: 6,
    title: 'Planification des missions',
    summary: 'Affecter un camion et un chauffeur, en sachant si c’est légal.',
    purpose:
      'C’est le seul écran tourné vers l’avenir. Avant d’enregistrer, l’application vérifie que la mission ne fait pas dépasser les plafonds de conduite — calculés sur les heures réellement mesurées, jamais sur un carnet rempli de mémoire.',
    audience: 'Gestionnaire de flotte, exploitation.',
    steps: [
      { action: 'Ouvrez « Planification des missions » puis « Nouvelle mission ».' },
      { action: 'Choisissez le véhicule, le chauffeur, l’origine, la destination et la date de départ.' },
      {
        action: 'Lisez l’évaluation avant d’enregistrer.',
        result:
          'L’application annonce la durée de conduite retenue, les pauses obligatoires et l’heure d’arrivée.',
      },
      {
        action: 'Si la mission est refusée, lisez le motif.',
        result: 'Passer outre reste possible, mais exige une justification écrite, qui est conservée.',
      },
    ],
    tips: [
      'L’allure retenue vient de la vitesse réellement observée sur votre flotte dès que suffisamment de trajets existent.',
      'Le motif de dépassement est la pièce qu’on vous demandera après un accident. Écrivez-le pour un lecteur qui n’était pas là.',
    ],
    limits: [
      'Le cadre réglementaire appliqué dépend de la région : UEMOA/CEDEAO en Afrique de l’Ouest, EAC à l’Est, SADC au Sud.',
    ],
  },
  {
    id: 'flotte',
    number: 7,
    title: 'Flotte & chauffeurs',
    summary: 'Enregistrer les camions, les conducteurs, les zones et les documents.',
    purpose:
      'Tout part d’ici. Un véhicule sans consommation de référence ne permet aucun calcul d’économie ; un chauffeur sans compte ne peut pas émettre de tournée.',
    audience: 'Gestionnaire de flotte, administrateur.',
    steps: [
      {
        action:
          'Onglet « Véhicules » : ajoutez un camion avec son immatriculation, son type, la contenance de son réservoir et sa consommation de référence constructeur.',
        result: 'La consommation de référence sert de base à la détection d’écart et au calcul des primes.',
      },
      {
        action:
          'Onglet « Chauffeurs » : créez la fiche, renseignez le permis et sa date d’expiration, puis affectez un véhicule.',
      },
      {
        action: 'Rattachez un compte utilisateur au chauffeur pour qu’il puisse ouvrir « Ma tournée ».',
      },
      {
        action:
          'Onglet « Réseau conventionné » : enregistrez les stations où vos cartes carburant fonctionnent, et relevez leurs prix.',
      },
    ],
    tips: [
      'Renseignez l’échéance d’entretien de chaque véhicule : sans elle, l’écran des échéances ne peut rien annoncer.',
      'Une station hors convention oblige le conducteur à avancer l’argent du plein.',
    ],
    limits: ['L’ajout de document de conformité depuis cet écran n’est pas encore raccordé.'],
  },
  {
    id: 'score',
    number: 8,
    title: 'Score de conduite',
    summary: 'Comment une note se construit, et comment l’expliquer à un chauffeur.',
    purpose:
      'Le score est calculé sur les trente derniers jours, à partir des infractions relevées sur la trace, rapportées à la distance parcourue. Chaque déduction est expliquée : c’est ce qui permet de tenir la conversation avec le conducteur.',
    audience: 'Responsable sécurité, gestionnaire de flotte.',
    steps: [
      { action: 'Ouvrez « Score de conduite » pour consulter les pondérations en vigueur.' },
      { action: 'Utilisez les curseurs pour comprendre le poids d’une infraction dans la note.' },
    ],
    tips: [
      'Un score calculé sur une trop courte distance n’est pas représentatif : l’application le signale plutôt que de le présenter comme un constat.',
    ],
    limits: [
      'Les curseurs sont un outil de compréhension. Ils n’affichent pas la conduite réelle d’une personne : celle-ci se lit sur sa fiche.',
    ],
  },
  {
    id: 'primes',
    number: 9,
    title: 'Primes & récompenses',
    summary: 'Partager avec le chauffeur le gazole qu’il a réellement économisé.',
    purpose:
      'Un conducteur qui consomme moins que la référence de son camion fait gagner de l’argent à l’entreprise. Le partage de ce gain est le levier le plus direct pour changer les habitudes au volant.',
    audience: 'Direction, gestionnaire de flotte.',
    steps: [
      {
        action: 'Enregistrez les pleins avec le relevé du compteur.',
        result:
          'La consommation se mesure d’un plein à l’autre. Sans le compteur, elle n’est pas calculable.',
      },
      {
        action:
          'Ouvrez « Primes & récompenses » pour voir le montant dû à chaque chauffeur et le motif de ceux qui n’y ont pas droit.',
      },
      {
        action:
          'Approuvez la prime, effectuez le versement par vos moyens habituels, puis constatez-le dans l’application.',
      },
    ],
    tips: [
      'Le montant se refait à la main : prime de base + litres épargnés × prix du litre × part du chauffeur. Le prix retenu est celui que vous payez réellement.',
      'Deux pleins au moins, espacés d’une distance suffisante, sont nécessaires pour qu’un chauffeur soit éligible.',
    ],
    limits: [
      'L’application n’effectue aucun transfert d’argent. Verser une prime en monnaie électronique suppose un agrégateur agréé par la BCEAO : tant qu’il n’est pas raccordé, seul le bon carburant peut être enregistré.',
      'Les badges se décernent à la main. Aucun critère n’est évalué automatiquement.',
    ],
  },
  {
    id: 'maintenance',
    number: 10,
    title: 'Maintenance & carburant',
    summary: 'Le carnet d’entretien, les pleins, et les écarts qu’ils révèlent.',
    purpose:
      'Le carnet d’entretien sert à prouver qu’une révision a eu lieu : devant un assureur, devant un acheteur, devant l’inspection technique. Les pleins, eux, servent à mesurer la consommation réelle.',
    audience: 'Atelier, gestionnaire de flotte.',
    steps: [
      {
        action:
          'Onglet « Maintenance » : enregistrez chaque intervention avec le relevé du compteur, le coût et le prestataire.',
        result: 'Le compteur du véhicule suit votre relevé s’il est plus élevé.',
      },
      {
        action: 'Onglet « Ravitaillement » : saisissez chaque plein avec le compteur, le volume et le prix.',
      },
      { action: 'Consultez les écarts de consommation relevés, chacun rattaché au plein qui l’a produit.' },
    ],
    tips: [
      'Le relevé du compteur est le champ qui compte le plus : sans lui, ni la consommation ni les échéances ne se calculent.',
    ],
    limits: [
      'Aucun capteur moteur n’équipe ces camions. L’usure d’un organe ne peut pas être prédite : seule la distance depuis la dernière intervention est connue.',
      'Aucun ordre de service n’est transmis à un garage. Contactez-le directement.',
    ],
  },
  {
    id: 'consignes',
    number: 11,
    title: 'Consignes aux chauffeurs',
    summary: 'Transmettre une instruction, et savoir qu’elle a été lue.',
    purpose:
      'Une consigne de sécurité transmise avant un départ finit parfois dans un dossier. Ce qui lui donne sa valeur n’est pas qu’elle ait été écrite, c’est qu’on puisse établir qu’elle a été reçue.',
    audience: 'Gestionnaire de flotte, responsable sécurité ; le chauffeur la reçoit.',
    steps: [
      { action: 'Ouvrez « Consignes », choisissez le chauffeur, écrivez le message ou partez d’un modèle.' },
      {
        action: 'Cochez « exiger une confirmation » pour une consigne de sécurité.',
      },
      {
        action: 'Suivez son état : en attente de relève, remise au téléphone, lue, puis confirmée.',
        result: 'Chaque étape est horodatée au moment où elle se produit.',
      },
      {
        action:
          'Côté chauffeur : la consigne s’affiche à l’ouverture de « Ma tournée ». Le bouton « J’ai pris connaissance » signe l’accusé.',
      },
    ],
    tips: [
      'Aucun de ces horodatages ne peut être renseigné depuis le poste de l’expéditeur. C’est précisément ce qui rend l’accusé opposable.',
    ],
    limits: [
      'La consigne parvient au chauffeur quand il ouvre sa console. Il n’y a ni notification poussée ni SMS : pour une urgence, appelez.',
    ],
  },
  {
    id: 'hors-ligne',
    number: 12,
    title: 'Travailler sans réseau',
    summary: 'Ce qui continue de fonctionner quand la connexion tombe.',
    purpose:
      'Sur un corridor, le réseau disparaît par tronçons entiers. L’application est faite pour cela : elle s’ouvre et s’utilise sans connexion, et rattrape au retour du signal.',
    audience: 'Tout le monde, surtout le terrain.',
    steps: [
      {
        action:
          'Ouvrez l’application au moins une fois avec du réseau : elle se garde ensuite sur l’appareil.',
      },
      { action: 'Hors réseau, continuez à saisir vos pleins, vos relevés de compteur et vos tournées.' },
      {
        action: 'Ouvrez le tiroir de synchronisation pour voir ce qui attend d’être transmis.',
        result: 'Chaque saisie refusée par le serveur affiche son motif, pour être corrigée.',
      },
    ],
    tips: ['Une saisie refusée n’est pas perdue : elle reste dans la file avec sa raison.'],
    limits: [
      'Les écrans d’analyse ont besoin du serveur : hors réseau, ils affichent les dernières données reçues.',
    ],
  },
  {
    id: 'donnees',
    number: 13,
    title: 'Vos données personnelles',
    summary: 'Ce qui est conservé, combien de temps, et ce qu’un chauffeur peut demander.',
    purpose:
      'Suivre la position d’une personne pendant son travail est une donnée sensible. Les durées de conservation sont publiées, et un chauffeur peut obtenir son dossier.',
    audience: 'Tout le monde ; l’effacement relève de l’administrateur.',
    steps: [
      { action: 'Un chauffeur peut consulter et exporter les données qui le concernent.' },
      { action: 'Un administrateur peut effacer les données de localisation d’un conducteur.' },
    ],
    tips: [
      'Les positions sont conservées 90 jours, les trajets et infractions un an. Au-delà, elles sont purgées automatiquement.',
    ],
    limits: [
      'La déclaration auprès de l’autorité de protection des données de votre pays reste à votre charge.',
    ],
  },
];

/**
 * Ce que l'application ne fait pas.
 *
 * Rassemblé en une seule fiche, à dessein. Un utilisateur qui cherche une
 * fonction absente doit pouvoir le constater en trente secondes plutôt que
 * d'écumer les écrans en se croyant maladroit.
 */
export const GUIDE_LIMITS: { title: string; detail: string }[] = [
  {
    title: 'Aucun envoi de SMS ni de courriel',
    detail:
      'Alertes, consignes et rappels d’échéance se consultent dans l’application. Aucune passerelle opérateur n’est raccordée.',
  },
  {
    title: 'Aucun transfert d’argent',
    detail:
      'Les primes se calculent et se constatent ici ; le versement se fait par vos moyens habituels. La monnaie électronique suppose un agrégateur agréé BCEAO.',
  },
  {
    title: 'Aucun capteur moteur',
    detail:
      'Pression d’huile, température, usure des plaquettes : rien de tout cela n’est remonté. L’entretien se suit au kilométrage.',
  },
  {
    title: 'Pas de suivi écran éteint',
    detail:
      'Le navigateur suspend la mesure quand le téléphone se verrouille. L’application le dit et compte les minutes manquantes.',
  },
  {
    title: 'Pas de calcul d’itinéraire routier',
    detail: 'Les distances entre étapes sont mesurées à vol d’oiseau : le kilométrage réel sera supérieur.',
  },
  {
    title: 'Aucun document officiel',
    detail:
      'Les impressions sont des états extraits de vos données. Elles n’ont valeur ni de certificat ni d’attestation.',
  },
];
