"""Passive PDN with separate, resistively damped reserve branches.

Each branch remains an independent RLC. No controller transfer function is
implied. With zero reserve branches this reduces to the original two-bank PDN.
"""
import numpy as np


def system(source, load, link_r, link_l, branches=()):
    c0, r0, l0 = source
    c1, r1, l1 = load
    n = len(branches)
    size = 3 + 2*n
    # States: source/load/reserve capacitor voltages; link/reserve currents.
    li = 2+n
    A = np.zeros((size, size)); B = np.zeros((size, 4))
    A[0, li] = -1/c0; B[0, 0] = 1/c0
    A[1, li] = 1/c1; B[1, 1] = -1/c1
    for k, (cap, _, _) in enumerate(branches):
        A[1, li+1+k] = -1/c1
        A[2+k, li+1+k] = 1/cap
    mass = np.zeros((n+1, n+1))
    mass[0, 0] = link_l+l0+l1; mass[0, 1:] = -l1
    rhs_a = np.zeros((n+1, size)); rhs_b = np.zeros((n+1, 4))
    rhs_a[0, :2] = [1, -1]; rhs_a[0, li] = -(r0+r1+link_r)
    rhs_a[0, li+1:] = r1; rhs_b[0] = [r0,r1,l0,l1]
    for k, (_, rb, lb) in enumerate(branches):
        mass[k+1, 0] = -l1; mass[k+1, 1:] = l1; mass[k+1, k+1] += lb
        rhs_a[k+1, 1] = 1; rhs_a[k+1, 2+k] = -1
        rhs_a[k+1, li] = r1; rhs_a[k+1, li+1:] = -r1
        rhs_a[k+1, li+1+k] -= rb; rhs_b[k+1] = [0,-r1,0,-l1]
    A[li:] = np.linalg.solve(mass, rhs_a); B[li:] = np.linalg.solve(mass, rhs_b)
    # Vload = Vc1 + R1*Ic1 + L1*dIc1/dt.
    current_row = np.r_[1., -np.ones(n)]
    C = np.zeros(size); C[1] = 1; C[li:] = r1*current_row
    C += l1*current_row@A[li:]
    D = np.array([0.,-r1,0.,-l1])+l1*current_row@B[li:]
    return A, B, C, D


def initial_state(v_source, v_load, current, branch_count):
    return np.r_[v_source, v_load, np.full(branch_count, v_load), current, np.zeros(branch_count)]
