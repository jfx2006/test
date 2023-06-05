/**
 *
 * Copyright (c) 2022, [Ribose Inc](https://www.ribose.com).
 * All rights reserved.
 * This file is a part of RNP sexp library
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
 * OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
 * ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * Original copyright
 *
 * SEXP implementation code sexp-output.c
 * Ron Rivest
 * 5/5/1997
 */

#include <sexp/sexp.h>

namespace sexp {
/*
 * sexp_simple_string_t::print_canonical_verbatim(os)
 * Print out simple string on output stream os as verbatim string.
 */
sexp_output_stream_t *sexp_simple_string_t::print_canonical_verbatim(
  sexp_output_stream_t *os) const
{
    const octet_t *c = c_str();
    /* print out len: */
    os->print_decimal(length())->var_put_char(':');
    /* print characters in fragment */
    for (uint32_t i = 0; i < length(); i++)
        os->var_put_char((int) *c++);
    return os;
}

/*
 * sexp_simple_string_t::advanced_length(os)
 * Returns length of printed image of s
 */
size_t sexp_simple_string_t::advanced_length(sexp_output_stream_t *os) const
{
    if (can_print_as_token(os))
        return advanced_length_token();
    else if (can_print_as_quoted_string())
        return advanced_length_quoted();
    else if (length() <= 4 && os->get_byte_size() == 8)
        return advanced_length_hexadecimal();
    else if (os->get_byte_size() == 8)
        return advanced_length_base64();
    else
        return 0; /* an error condition */
}

/*
 * sexp_simple_string_t::print_token(os)
 * Prints out simple string ss as a token (assumes that this is OK).
 * May run over max-column, but there is no fragmentation allowed...
 */
sexp_output_stream_t *sexp_simple_string_t::print_token(sexp_output_stream_t *os) const
{
    const octet_t *c = c_str();
    if (os->get_max_column() > 0 && os->get_column() > (os->get_max_column() - length()))
        os->new_line(sexp_output_stream_t::advanced);
    for (uint32_t i = 0; i < length(); i++)
        os->put_char((int) (*c++));
    return os;
}

/*
 * sexp_simple_string_t::print_base64(os)
 * Prints out simple string ss as a base64 value.
 */
sexp_output_stream_t *sexp_simple_string_t::print_base64(sexp_output_stream_t *os) const
{
    const octet_t *c = c_str();
    os->var_put_char('|')->change_output_byte_size(6, sexp_output_stream_t::advanced);
    for (uint32_t i = 0; i < length(); i++)
        os->var_put_char((int) (*c++));
    return os->flush()
      ->change_output_byte_size(8, sexp_output_stream_t::advanced)
      ->var_put_char('|');
}

/*
 * sexp_simple_string_t::print_hexadecimal(os)
 * Prints out simple string as a hexadecimal value.
 */
sexp_output_stream_t *sexp_simple_string_t::print_hexadecimal(sexp_output_stream_t *os) const
{
    const octet_t *c = c_str();
    os->put_char('#')->change_output_byte_size(4, sexp_output_stream_t::advanced);
    for (uint32_t i = 0; i < length(); i++)
        os->var_put_char((int) (*c++));
    return os->flush()
      ->change_output_byte_size(8, sexp_output_stream_t::advanced)
      ->put_char('#');
}

/*
 * sexp_simple_string_t::print_quoted(os)
 * Prints out simple string ss as a quoted string
 * This code assumes that all characters are tokenchars and blanks,
 *  so no escape sequences need to be generated.
 * May run over max-column, but there is no fragmentation allowed...
 */
sexp_output_stream_t *sexp_simple_string_t::print_quoted(sexp_output_stream_t *os) const
{
    const octet_t *c = c_str();
    os->put_char('\"');
    for (uint32_t i = 0; i < length(); i++) {
        if (os->get_max_column() > 0 && os->get_column() >= os->get_max_column() - 2) {
            os->put_char('\\')->put_char('\n');
            os->reset_column();
        }
        os->put_char(*c++);
    }
    return os->put_char('\"');
}

/*
 * sexp_simple_string_t::print_advanced(os)
 * Prints out simple string onto output stream ss
 */
sexp_output_stream_t *sexp_simple_string_t::print_advanced(sexp_output_stream_t *os) const
{
    if (can_print_as_token(os))
        print_token(os);
    else if (can_print_as_quoted_string())
        print_quoted(os);
    else if (length() <= 4 && os->get_byte_size() == 8)
        print_hexadecimal(os);
    else if (os->get_byte_size() == 8)
        print_base64(os);
    else
        sexp_error(sexp_exception_t::error,
                   "Can't print in advanced mode with restricted output character set",
                   0,
                   0,
                   EOF);
    return os;
}

/*
 * sexp_simple_string_t::can_print_as_quoted_string(void)
 * Returns true if simple string can be printed as a quoted string.
 * Must have only tokenchars and blanks.
 */
bool sexp_simple_string_t::can_print_as_quoted_string(void) const
{
    const octet_t *c = c_str();
    for (uint32_t i = 0; i < length(); i++, c++) {
        if (!is_token_char((int) (*c)) && *c != ' ')
            return false;
    }
    return true;
}

/*
 * sexp_simple_string_t::can_print_as_token(os)
 * Returns true if simple string can be printed as a token.
 * Doesn't begin with a digit, and all characters are tokenchars.
 */
bool sexp_simple_string_t::can_print_as_token(const sexp_output_stream_t *os) const
{
    const octet_t *c = c_str();
    if (length() <= 0)
        return false;
    if (is_dec_digit((int) *c))
        return false;
    if (os->get_max_column() > 0 && os->get_column() + length() >= os->get_max_column())
        return false;
    for (uint32_t i = 0; i < length(); i++) {
        if (!is_token_char((int) (*c++)))
            return false;
    }
    return true;
}

} // namespace sexp
