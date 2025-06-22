-- MySQL dump 10.13  Distrib 8.0.40, for Win64 (x86_64)
--
-- Host: database-web.c3kq4isqkxwl.eu-north-1.rds.amazonaws.com    Database: thesis_support_system
-- ------------------------------------------------------
-- Server version	8.0.41

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `admin_secretariat`
--

DROP TABLE IF EXISTS `admin_secretariat`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_secretariat` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admin_secretariat`
--

LOCK TABLES `admin_secretariat` WRITE;
/*!40000 ALTER TABLE `admin_secretariat` DISABLE KEYS */;
INSERT INTO `admin_secretariat` VALUES (1,'admin','admin');
/*!40000 ALTER TABLE `admin_secretariat` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cancellations`
--

DROP TABLE IF EXISTS `cancellations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cancellations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `thesis_id` int DEFAULT NULL,
  `cancelled_by` enum('student','supervisor','secretariat') COLLATE utf8mb4_general_ci NOT NULL,
  `reason` text COLLATE utf8mb4_general_ci,
  `gs_number` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `gs_year` year DEFAULT NULL,
  `cancelled_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `thesis_id` (`thesis_id`),
  KEY `idx_cancellations_thesis` (`thesis_id`),
  CONSTRAINT `cancellations_ibfk_1` FOREIGN KEY (`thesis_id`) REFERENCES `theses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cancellations`
--

LOCK TABLES `cancellations` WRITE;
/*!40000 ALTER TABLE `cancellations` DISABLE KEYS */;
/*!40000 ALTER TABLE `cancellations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `committee_members`
--

DROP TABLE IF EXISTS `committee_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `committee_members` (
  `thesis_id` int NOT NULL,
  `professor_id` int NOT NULL,
  `response` enum('Αναμένεται','Αποδεκτή','Απορρίφθηκε') COLLATE utf8mb4_general_ci DEFAULT 'Αναμένεται',
  `response_date` datetime DEFAULT NULL,
  `invitation_date` datetime DEFAULT NULL,
  PRIMARY KEY (`thesis_id`,`professor_id`),
  KEY `professor_id` (`professor_id`),
  CONSTRAINT `committee_members_ibfk_1` FOREIGN KEY (`thesis_id`) REFERENCES `theses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `committee_members_ibfk_2` FOREIGN KEY (`professor_id`) REFERENCES `professors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `committee_members`
--

LOCK TABLES `committee_members` WRITE;
/*!40000 ALTER TABLE `committee_members` DISABLE KEYS */;
/*!40000 ALTER TABLE `committee_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `draft_submissions`
--

DROP TABLE IF EXISTS `draft_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `draft_submissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `thesis_id` int NOT NULL,
  `student_id` int NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `external_links` text COLLATE utf8mb4_general_ci,
  `uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `thesis_id` (`thesis_id`),
  KEY `student_id` (`student_id`),
  CONSTRAINT `draft_submissions_ibfk_1` FOREIGN KEY (`thesis_id`) REFERENCES `theses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `draft_submissions_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `draft_submissions`
--

LOCK TABLES `draft_submissions` WRITE;
/*!40000 ALTER TABLE `draft_submissions` DISABLE KEYS */;
INSERT INTO `draft_submissions` VALUES (2,56,1,'e242c9e108c95dc2c751c5061b24c675','https://www.youtube.com/watch?v=Z8KnFEE3ln4&t=19s ','2025-06-21 17:31:14'),(3,61,17,'d0bc405aca3e18dcae93309d38df96fd','gh,ghlfykftyk','2025-06-22 18:07:29');
/*!40000 ALTER TABLE `draft_submissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `grades`
--

DROP TABLE IF EXISTS `grades`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `grades` (
  `id` int NOT NULL AUTO_INCREMENT,
  `thesis_id` int NOT NULL,
  `professor_id` int NOT NULL,
  `grade` decimal(5,2) NOT NULL,
  `criteria` json NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_grade` (`thesis_id`,`professor_id`),
  KEY `professor_id` (`professor_id`),
  CONSTRAINT `grades_ibfk_1` FOREIGN KEY (`thesis_id`) REFERENCES `theses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `grades_ibfk_2` FOREIGN KEY (`professor_id`) REFERENCES `professors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `grades`
--

LOCK TABLES `grades` WRITE;
/*!40000 ALTER TABLE `grades` DISABLE KEYS */;
/*!40000 ALTER TABLE `grades` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invitations`
--

DROP TABLE IF EXISTS `invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invitations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `thesis_id` int DEFAULT NULL,
  `invited_professor_id` int DEFAULT NULL,
  `invited_by_student_id` int DEFAULT NULL,
  `status` enum('Αναμένεται','Αποδεκτή','Απορρίφθηκε') COLLATE utf8mb4_general_ci DEFAULT 'Αναμένεται',
  `invitation_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `response_date` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `thesis_id` (`thesis_id`),
  KEY `invitations_ibfk_2_idx` (`invited_professor_id`),
  KEY `invitations_ibfk_3_idx` (`invited_by_student_id`),
  CONSTRAINT `fk_invited_by_student` FOREIGN KEY (`invited_by_student_id`) REFERENCES `students` (`id`),
  CONSTRAINT `invitations_ibfk_1` FOREIGN KEY (`thesis_id`) REFERENCES `theses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `invitations_ibfk_2` FOREIGN KEY (`invited_professor_id`) REFERENCES `professors` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=135 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invitations`
--

LOCK TABLES `invitations` WRITE;
/*!40000 ALTER TABLE `invitations` DISABLE KEYS */;
/*!40000 ALTER TABLE `invitations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `library_submissions`
--

DROP TABLE IF EXISTS `library_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `library_submissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `thesis_id` int DEFAULT NULL,
  `repository_link` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `submitted_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `thesis_id` (`thesis_id`),
  CONSTRAINT `library_submissions_ibfk_1` FOREIGN KEY (`thesis_id`) REFERENCES `theses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `library_submissions`
--

LOCK TABLES `library_submissions` WRITE;
/*!40000 ALTER TABLE `library_submissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `library_submissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notes`
--

DROP TABLE IF EXISTS `notes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `thesis_id` int DEFAULT NULL,
  `professor_id` int DEFAULT NULL,
  `content` varchar(300) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `thesis_id` (`thesis_id`),
  KEY `professor_id` (`professor_id`),
  CONSTRAINT `notes_ibfk_1` FOREIGN KEY (`thesis_id`) REFERENCES `theses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notes_ibfk_2` FOREIGN KEY (`professor_id`) REFERENCES `professors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notes`
--

LOCK TABLES `notes` WRITE;
/*!40000 ALTER TABLE `notes` DISABLE KEYS */;
/*!40000 ALTER TABLE `notes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `presentation_details`
--

DROP TABLE IF EXISTS `presentation_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `presentation_details` (
  `id` int NOT NULL AUTO_INCREMENT,
  `thesis_id` int DEFAULT NULL,
  `presentation_date` datetime NOT NULL,
  `mode` enum('Δια ζώσης','Διαδικτυακά') COLLATE utf8mb4_general_ci NOT NULL,
  `location_or_link` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `announcement_text` text COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Το πλήρες κείμενο της ανακοίνωσης για την παρουσίαση',
  PRIMARY KEY (`id`),
  UNIQUE KEY `thesis_id` (`thesis_id`),
  CONSTRAINT `presentation_details_ibfk_1` FOREIGN KEY (`thesis_id`) REFERENCES `theses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `presentation_details`
--

LOCK TABLES `presentation_details` WRITE;
/*!40000 ALTER TABLE `presentation_details` DISABLE KEYS */;
/*!40000 ALTER TABLE `presentation_details` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `professors`
--

DROP TABLE IF EXISTS `professors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `professors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `surname` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `topic` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `landline` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `mobile` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `department` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `university` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `professors`
--

LOCK TABLES `professors` WRITE;
/*!40000 ALTER TABLE `professors` DISABLE KEYS */;
INSERT INTO `professors` VALUES (15,'Γιώργος','Κωνσταντίνου','g.konst@uoa.gr','Δομές Δεδομένων','2101001001','6901111111','Πληροφορικής','Εθνικό και Καποδιστριακό Πανεπιστήμιο Αθηνών','123'),(16,'Ειρήνη','Αλεξίου','e.alexiou@uoa.gr','Τεχνητή Νοημοσύνη','2101001002','6902222222','Πληροφορικής','Εθνικό και Καποδιστριακό Πανεπιστήμιο Αθηνών','123'),(17,'Στέφανος','Δημητρίου','s.dimitriou@uoa.gr','Αλγόριθμοι','2101001003','6903333333','Πληροφορικής','Εθνικό και Καποδιστριακό Πανεπιστήμιο Αθηνών','123'),(18,'Αναστασία','Κυριακίδου','a.kyriakidou@uoa.gr','Λειτουργικά Συστήματα','2101001004','6904444444','Πληροφορικής','Εθνικό και Καποδιστριακό Πανεπιστήμιο Αθηνών','123'),(19,'Παναγιώτης','Μακρής','p.makris@uoa.gr','Ασφάλεια Υπολογιστών','2101001005','6905555555','Πληροφορικής','Εθνικό και Καποδιστριακό Πανεπιστήμιο Αθηνών','123');
/*!40000 ALTER TABLE `professors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `students`
--

DROP TABLE IF EXISTS `students`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `students` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `surname` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `student_number` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `street` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `number` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `postcode` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `father_name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `landline_telephone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `mobile_telephone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `student_number` (`student_number`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `students`
--

LOCK TABLES `students` WRITE;
/*!40000 ALTER TABLE `students` DISABLE KEYS */;
INSERT INTO `students` VALUES (20,'Γιάννης','Παπαδόπουλος','1100001','Ακαδημίας','10','Αθήνα','10559','Δημήτρης','2101111111','6971111111','giannis.pap@example.com','123'),(21,'Μαρία','Ιωάννου','1100002','Σόλωνος','23','Αθήνα','10671','Αντώνης','2102222222','6972222222','maria.ioa@example.com','123'),(22,'Νίκος','Καραγιάννης','1100003','Ερμού','56','Αθήνα','10563','Γεώργιος','2103333333','6973333333','nikos.kara@example.com','123'),(23,'Ελένη','Αναστασίου','1100004','Πατησίων','78','Αθήνα','10434','Κωνσταντίνος','2104444444','6974444444','eleni.ana@example.com','123'),(24,'Πέτρος','Μαυρίδης','1100005','Θησέως','11','Καλλιθέα','17672','Λουκάς','2105555555','6975555555','petros.mav@example.com','123'),(25,'Αναστασία','Χριστοπούλου','1100006','Σταδίου','2','Αθήνα','10562','Χρήστος','2106666666','6976666666','anast.chris@example.com','123'),(26,'Χρήστος','Λυμπερόπουλος','1100007','Μητροπόλεως','18','Αθήνα','10563','Νεκτάριος','2107777777','6977777777','xristos.lym@example.com','123'),(27,'Σοφία','Νικολάου','1100008','Κοραή','4','Πειραιάς','18531','Αχιλλέας','2108888888','6978888888','sofia.nik@example.com','123'),(28,'Αλέξανδρος','Σπυρόπουλος','1100009','Φιλελλήνων','30','Αθήνα','10558','Σπύρος','2109999999','6979999999','alex.spy@example.com','123'),(29,'Κατερίνα','Παπακωνσταντίνου','1100010','Αιόλου','5','Αθήνα','10551','Νικόλαος','2100000000','6980000000','katerina.pap@example.com','123');
/*!40000 ALTER TABLE `students` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `theses`
--

DROP TABLE IF EXISTS `theses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `theses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int DEFAULT NULL,
  `topic_id` int DEFAULT NULL,
  `supervisor_id` int DEFAULT NULL,
  `status` enum('Υπό Ανάθεση','Ενεργή','Υπό Εξέταση','Περατωμένη','Ακυρωμένη') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `official_assignment_date` date DEFAULT NULL,
  `final_grade` decimal(4,2) DEFAULT NULL,
  `library_repository_link` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `examination_minutes` text COLLATE utf8mb4_general_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `gs_number` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Αριθμός ΓΣ για ενεργή κατάσταση',
  `gs_year` varchar(4) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Έτος ΓΣ για ενεργή κατάσταση',
  `cancellation_reason` text COLLATE utf8mb4_general_ci COMMENT 'Λόγος ακύρωσης (ελεύθερο κείμενο)',
  PRIMARY KEY (`id`),
  KEY `student_id` (`student_id`),
  KEY `topic_id` (`topic_id`),
  KEY `supervisor_id` (`supervisor_id`),
  KEY `idx_theses_status` (`status`),
  KEY `idx_theses_gs` (`gs_number`,`gs_year`),
  CONSTRAINT `theses_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`),
  CONSTRAINT `theses_ibfk_2` FOREIGN KEY (`topic_id`) REFERENCES `thesis_topics` (`id`),
  CONSTRAINT `theses_ibfk_3` FOREIGN KEY (`supervisor_id`) REFERENCES `professors` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `theses`
--

LOCK TABLES `theses` WRITE;
/*!40000 ALTER TABLE `theses` DISABLE KEYS */;
/*!40000 ALTER TABLE `theses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thesis_topics`
--

DROP TABLE IF EXISTS `thesis_topics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `thesis_topics` (
  `id` int NOT NULL AUTO_INCREMENT,
  `professor_id` int DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `summary` text COLLATE utf8mb4_general_ci,
  `pdf_file_path` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `professor_id` (`professor_id`),
  CONSTRAINT `thesis_topics_ibfk_1` FOREIGN KEY (`professor_id`) REFERENCES `professors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thesis_topics`
--

LOCK TABLES `thesis_topics` WRITE;
/*!40000 ALTER TABLE `thesis_topics` DISABLE KEYS */;
/*!40000 ALTER TABLE `thesis_topics` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-06-22 21:32:12
