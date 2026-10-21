-- ============================================================
-- INFRAMEN - Base de datos para MySQL
-- Se puede ejecutar varias veces sin borrar datos existentes.
-- ============================================================

CREATE DATABASE IF NOT EXISTS inframen
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE inframen;

-- Tabla 7. estudiante (el NIE tiene 8 dígitos)
CREATE TABLE IF NOT EXISTS estudiante (
  nie       CHAR(8)      PRIMARY KEY,
  nombres   VARCHAR(80)  NOT NULL,
  apellidos VARCHAR(80)  NOT NULL,
  grado     VARCHAR(20)  NOT NULL,
  seccion   VARCHAR(10)  NOT NULL,
  foto_url  VARCHAR(255) NULL,
  estado    ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO'
) ENGINE=InnoDB;

-- Tabla 6. usuario (personal y estudiantes; "nie" solo se llena en las cuentas de ESTUDIANTE)
CREATE TABLE IF NOT EXISTS usuario (
  id_usuario      INT AUTO_INCREMENT PRIMARY KEY,
  nombre_usuario  VARCHAR(50)  NOT NULL UNIQUE,
  nombre_completo VARCHAR(100) NOT NULL,
  contrasena_hash VARCHAR(255) NOT NULL,
  rol             ENUM('ADMINISTRADOR','DOCENTE','CONTROL','ESTUDIANTE') NOT NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  nie             CHAR(8)      NULL,
  CONSTRAINT fk_usuario_estudiante FOREIGN KEY (nie) REFERENCES estudiante (nie)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- Tabla 8. horario (dia_semana: 1 = lunes ... 5 = viernes)
CREATE TABLE IF NOT EXISTS horario (
  id_horario     INT AUTO_INCREMENT PRIMARY KEY,
  nie            CHAR(8)  NOT NULL,
  dia_semana     TINYINT  NOT NULL,
  hora_entrada   TIME     NOT NULL,
  hora_salida    TIME     NOT NULL,
  tolerancia_min SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_horario_estudiante FOREIGN KEY (nie) REFERENCES estudiante (nie)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT uq_horario_dia UNIQUE (nie, dia_semana)
) ENGINE=InnoDB;

-- Tabla 9. ingreso
CREATE TABLE IF NOT EXISTS ingreso (
  id_ingreso           INT AUTO_INCREMENT PRIMARY KEY,
  nie                  CHAR(8)  NOT NULL,
  id_usuario           INT      NOT NULL,
  fecha_hora           DATETIME NOT NULL,
  estado               ENUM('PUNTUAL','TARDE') NOT NULL,
  identidad_confirmada TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_ingreso_estudiante FOREIGN KEY (nie) REFERENCES estudiante (nie)
    ON UPDATE CASCADE,
  CONSTRAINT fk_ingreso_usuario FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario),
  INDEX idx_ingreso_fecha (fecha_hora)
) ENGINE=InnoDB;

-- Tabla 10. ficha_retardo (como máximo una por ingreso)
CREATE TABLE IF NOT EXISTS ficha_retardo (
  id_ficha        INT AUTO_INCREMENT PRIMARY KEY,
  id_ingreso      INT      NOT NULL UNIQUE,
  minutos_retardo SMALLINT NOT NULL,
  observacion     VARCHAR(255) NULL,
  fecha_registro  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ficha_ingreso FOREIGN KEY (id_ingreso) REFERENCES ingreso (id_ingreso)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tabla 11. nota_estudiante (notas de docentes/administradores, p. ej. "llega tarde todos los días")
CREATE TABLE IF NOT EXISTS nota_estudiante (
  id_nota        INT AUTO_INCREMENT PRIMARY KEY,
  nie            CHAR(8)       NOT NULL,
  id_usuario     INT           NULL,
  autor_nombre   VARCHAR(100)  NOT NULL,
  autor_rol      VARCHAR(20)   NOT NULL,
  texto          VARCHAR(1000) NOT NULL,
  fecha_registro DATETIME      NOT NULL,
  CONSTRAINT fk_nota_estudiante FOREIGN KEY (nie) REFERENCES estudiante (nie)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_nota_usuario FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario)
    ON DELETE SET NULL,
  INDEX idx_nota_nie (nie, fecha_registro)
) ENGINE=InnoDB;

-- ============================================================
-- DATOS DE EJEMPLO
-- Usuarios de ejemplo: docente01 y admin.
-- IMPORTANTE: al instalar, entre como admin y cambie las contraseñas de ambos en Administración > Usuarios.
-- ============================================================

INSERT IGNORE INTO usuario (id_usuario, nombre_usuario, nombre_completo, contrasena_hash, rol, activo) VALUES
  (1, 'docente01', 'Docente de ejemplo',  '$2b$10$n4PBky1QphwFpMi10lY51eCwjv8buSOVaGzvWoo5ryqMyUNLepNoC', 'DOCENTE', 1),
  (2, 'admin',     'Administrador',       '$2b$10$g6WXXUmvvVdwc0vyEVOW1uLPFyDRHwlJONnfsm/qJQV4zuKTUa2Fq', 'ADMINISTRADOR', 1);

INSERT IGNORE INTO estudiante (nie, nombres, apellidos, grado, seccion, foto_url, estado) VALUES
  ('12345678', 'Estudiante de ejemplo', '1', 'Segundo año', 'B', NULL, 'ACTIVO'),
  ('23456789', 'Estudiante de ejemplo', '2', 'Primer año',  'A', NULL, 'ACTIVO'),
  ('34567890', 'Estudiante de ejemplo', '3', 'Tercer año',  'C', NULL, 'ACTIVO');

-- Horario de lunes a viernes: entrada 07:00 a. m., salida 12:00 m., sin tolerancia
INSERT IGNORE INTO horario (nie, dia_semana, hora_entrada, hora_salida, tolerancia_min)
SELECT e.nie, d.dia, '07:00:00', '12:00:00', 0
FROM estudiante e
JOIN (SELECT 1 AS dia UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) d;

INSERT IGNORE INTO ingreso (id_ingreso, nie, id_usuario, fecha_hora, estado, identidad_confirmada) VALUES
  (1, '12345678', 1, '2026-10-02 07:15:00', 'TARDE', 1),
  (2, '23456789', 1, '2026-10-05 07:42:00', 'TARDE', 1),
  (3, '34567890', 1, '2026-10-07 07:08:00', 'TARDE', 1),
  (4, '12345678', 1, '2026-10-08 07:30:00', 'TARDE', 1);

INSERT IGNORE INTO ficha_retardo (id_ficha, id_ingreso, minutos_retardo, observacion) VALUES
  (1, 1, 15, NULL),
  (2, 2, 42, NULL),
  (3, 3, 8,  NULL),
  (4, 4, 30, NULL);