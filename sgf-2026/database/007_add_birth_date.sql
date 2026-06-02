-- Migration: 007_add_birth_date
-- Description: Adiciona coluna birth_date na tabela profiles para armazenar a data de nascimento do motorista

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date DATE;
