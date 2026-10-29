"""Tests for logic.py (no terminal I/O involved)."""

import json
import unittest

import logic
from logic import Transaction


def make_balances(nets):
    """Build a balances dict from {name: net_paise}."""
    return {name: {"paid": 0, "share": 0, "net": net} for name, net in nets.items()}


def apply_settlements(nets, settlements):
    """Return the net balances after the proposed payments are made."""
    result = dict(nets)
    for debtor, creditor, amount in settlements:
        result[debtor] += amount
        result[creditor] -= amount
    return result


class TestMoney(unittest.TestCase):
    def test_parse_valid_amounts(self):
        self.assertEqual(logic.parse_amount("1200.50"), 120050)
        self.assertEqual(logic.parse_amount("1,200"), 120000)
        self.assertEqual(logic.parse_amount("₹5"), 500)
        self.assertEqual(logic.parse_amount("10.5"), 1050)
        self.assertEqual(logic.parse_amount(" 0.07 "), 7)

    def test_parse_invalid_amounts(self):
        for bad in ["", "abc", "-5", "10.555", "1.2.3", "0", "0.00"]:
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    logic.parse_amount(bad)

    def test_parse_zero_allowed(self):
        self.assertEqual(logic.parse_amount("0", allow_zero=True), 0)

    def test_format_inr(self):
        self.assertEqual(logic.format_inr(120050), "₹1,200.50")
        self.assertEqual(logic.format_inr(5), "₹0.05")
        self.assertEqual(logic.format_inr(0), "₹0.00")
        self.assertEqual(logic.format_inr(-150), "-₹1.50")


class TestNames(unittest.TestCase):
    def test_valid_names(self):
        self.assertEqual(logic.validate_names(["Parth", "Rahul"]), ["Parth", "Rahul"])

    def test_too_few_names(self):
        with self.assertRaises(ValueError):
            logic.validate_names(["Parth"])

    def test_duplicates_case_insensitive(self):
        with self.assertRaises(ValueError):
            logic.validate_names(["Parth", "Rahul", "parth"])


class TestSplits(unittest.TestCase):
    def test_equal_even(self):
        self.assertEqual(logic.split_equal(900, ["A", "B", "C"]), {"A": 300, "B": 300, "C": 300})

    def test_equal_with_remainder_sums_exactly(self):
        shares = logic.split_equal(10000, ["A", "B", "C"])  # ₹100 / 3
        self.assertEqual(sum(shares.values()), 10000)
        self.assertEqual(shares, {"A": 3334, "B": 3333, "C": 3333})

    def test_equal_remainder_larger_than_one(self):
        shares = logic.split_equal(5, ["A", "B", "C"])  # 5 paise / 3
        self.assertEqual(shares, {"A": 2, "B": 2, "C": 1})

    def test_equal_no_participants(self):
        with self.assertRaises(ValueError):
            logic.split_equal(100, [])

    def test_unequal_valid(self):
        shares = {"A": 700, "B": 300, "C": 0}  # zero share allowed
        self.assertEqual(logic.validate_unequal(1000, shares), shares)

    def test_unequal_short_and_over(self):
        with self.assertRaises(ValueError):
            logic.validate_unequal(1000, {"A": 400, "B": 500})
        with self.assertRaises(ValueError):
            logic.validate_unequal(1000, {"A": 600, "B": 500})


class TestBalances(unittest.TestCase):
    def test_payer_shares_own_expense(self):
        tx = Transaction("Dinner", "A", 30000, {"A": 10000, "B": 10000, "C": 10000})
        balances = logic.compute_balances(["A", "B", "C"], [tx])
        self.assertEqual(balances["A"], {"paid": 30000, "share": 10000, "net": 20000})
        self.assertEqual(balances["B"]["net"], -10000)
        self.assertEqual(balances["C"]["net"], -10000)

    def test_payer_not_a_participant(self):
        tx = Transaction("Gift", "A", 20000, {"B": 10000, "C": 10000})
        balances = logic.compute_balances(["A", "B", "C"], [tx])
        self.assertEqual(balances["A"], {"paid": 20000, "share": 0, "net": 20000})

    def test_payer_only_participant_changes_nothing(self):
        tx = Transaction("Solo", "A", 5000, {"A": 5000})
        balances = logic.compute_balances(["A", "B"], [tx])
        self.assertEqual(balances["A"]["net"], 0)
        self.assertEqual(balances["B"]["net"], 0)

    def test_balances_sum_to_zero(self):
        txs = [
            Transaction("T1", "A", 10000, logic.split_equal(10000, ["A", "B", "C"])),
            Transaction("T2", "B", 4500, {"A": 1000, "C": 3500}),
        ]
        balances = logic.compute_balances(["A", "B", "C"], txs)
        self.assertEqual(sum(b["net"] for b in balances.values()), 0)


class TestPairwiseDebts(unittest.TestCase):
    def test_opposite_debts_are_netted(self):
        txs = [
            Transaction("T1", "A", 30000, {"A": 10000, "B": 10000, "C": 10000}),
            Transaction("T2", "B", 10000, {"A": 5000, "B": 5000}),
        ]
        # B owes A 100, A owes B 50 -> B owes A 50. C owes A 100.
        self.assertEqual(
            logic.pairwise_debts(txs),
            {("B", "A"): 5000, ("C", "A"): 10000},
        )

    def test_exactly_cancelling_debts_disappear(self):
        txs = [
            Transaction("T1", "A", 10000, {"B": 10000}),
            Transaction("T2", "B", 10000, {"A": 10000}),
        ]
        self.assertEqual(logic.pairwise_debts(txs), {})


class TestSimplifyDebts(unittest.TestCase):
    def check_settles(self, nets):
        settlements = logic.simplify_debts(make_balances(nets))
        after = apply_settlements(nets, settlements)
        self.assertTrue(all(v == 0 for v in after.values()), after)
        self.assertLessEqual(len(settlements), max(len(nets) - 1, 0))
        for debtor, creditor, amount in settlements:
            self.assertGreater(amount, 0)
            self.assertNotEqual(debtor, creditor)
        return settlements

    def test_already_settled(self):
        self.assertEqual(logic.simplify_debts(make_balances({"A": 0, "B": 0})), [])

    def test_simple_one_to_one(self):
        self.assertEqual(
            self.check_settles({"A": 30000, "B": -30000}),
            [("B", "A", 30000)],
        )

    def test_chain_collapses_to_one_payment(self):
        # A owes B, B owes C (B nets to zero) -> A pays C directly.
        self.assertEqual(
            self.check_settles({"A": -10000, "B": 0, "C": 10000}),
            [("A", "C", 10000)],
        )

    def test_multiple_debtors_and_creditors(self):
        nets = {"A": -50000, "B": -30000, "C": 60000, "D": 20000}
        settlements = self.check_settles(nets)
        self.assertEqual(len(settlements), 3)

    def test_one_creditor_many_debtors(self):
        self.check_settles({"A": 30000, "B": -10000, "C": -10000, "D": -10000})

    def test_with_rounding_paise(self):
        shares = logic.split_equal(10000, ["A", "B", "C"])
        tx = Transaction("Odd split", "A", 10000, shares)
        balances = logic.compute_balances(["A", "B", "C"], [tx])
        settlements = logic.simplify_debts(balances)
        after = apply_settlements({p: b["net"] for p, b in balances.items()}, settlements)
        self.assertTrue(all(v == 0 for v in after.values()))

    def test_unbalanced_input_raises(self):
        with self.assertRaises(ValueError):
            logic.simplify_debts(make_balances({"A": 100, "B": -50}))


class TestExport(unittest.TestCase):
    def test_export_is_json_serializable(self):
        tx = Transaction("Dinner", "A", 20000, {"A": 10000, "B": 10000})
        balances = logic.compute_balances(["A", "B"], [tx])
        settlements = logic.simplify_debts(balances)
        data = logic.build_export(["A", "B"], [tx], balances, settlements)
        text = json.dumps(data)
        self.assertEqual(json.loads(text)["settlements"], [{"from": "B", "to": "A", "amount": 10000}])


if __name__ == "__main__":
    unittest.main()